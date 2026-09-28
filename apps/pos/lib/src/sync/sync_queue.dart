import 'dart:convert';
import 'dart:math';

import 'package:drift/drift.dart';

import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/data/unit_of_work.dart';
import 'package:pos/src/sync/payload_guard.dart';
import 'package:pos/src/sync/sync_operation.dart';
import 'package:pos/src/sync/sync_state.dart';

/// Local sync queue foundation over the `SyncOperations` outbox table.
///
/// Scope of this class is the queue lifecycle only: enqueue, claim, transition,
/// reclaim, and count. Pushing to the server, retry scheduling, conflict
/// detection, and sync triggering are the later offline-sync tasks
/// (`plans/11_OFFLINE_SYNC.md`) and are not implemented here.
///
/// The queue is the local half of BR-037/BR-038. Enqueue is idempotent on
/// `operationId`, so re-running a business command after a crash re-uses the
/// existing row instead of queuing a duplicate, and the server still applies
/// each operation ID at most once.
class SyncQueue {
  final AppDatabase _db;
  final UnitOfWork _unitOfWork;

  /// Monotonic suffix so two ids generated in the same instant cannot collide.
  int _idCounter = 0;

  SyncQueue(this._db) : _unitOfWork = UnitOfWork(_db);

  /// Enqueues a business command for later synchronization.
  ///
  /// Returns the id of the created row, or the id of the existing row when
  /// [operationId] has already been enqueued. The payload is checked by
  /// [PayloadGuard] before anything is written, so a rejected payload leaves
  /// no row behind.
  ///
  /// [operationId] must be supplied by the caller. Generating it is a separate
  /// concern owned by the operation-identity work, and this class does not
  /// invent a format.
  Future<String> enqueue({
    required String deviceId,
    required String operationId,
    required SyncOperationType type,
    required Map<String, dynamic> payload,
    DateTime? now,
  }) async {
    if (operationId.trim().isEmpty) {
      throw ArgumentError.value(
        operationId,
        'operationId',
        'must not be empty (BR-037)',
      );
    }

    final encoded = jsonEncode(payload);
    PayloadGuard.check(encoded);

    final existing = await (_db.select(
      _db.syncOperations,
    )..where((o) => o.operationId.equals(operationId))).getSingleOrNull();
    if (existing != null) {
      return existing.id;
    }

    final timestamp = now ?? DateTime.now().toUtc();
    final id = _newId();
    await _db
        .into(_db.syncOperations)
        .insert(
          SyncOperationsCompanion.insert(
            id: id,
            deviceId: deviceId,
            operationId: operationId,
            operationType: type.wireName,
            payload: encoded,
            state: Value(SyncState.pending.wireName),
            attempts: const Value(0),
            createdAt: timestamp,
            updatedAt: timestamp,
          ),
        );
    return id;
  }

  /// Operations waiting to be pushed, oldest first, for [deviceId].
  ///
  /// Includes `RETRY` as well as `PENDING`, because a retried operation is
  /// outstanding and must become claimable again.
  Future<List<QueuedOperation>> pending(
    String deviceId, {
    int limit = 50,
  }) async {
    final rows =
        await (_db.select(_db.syncOperations)
              ..where(
                (o) =>
                    o.deviceId.equals(deviceId) &
                    o.state.isIn([
                      SyncState.pending.wireName,
                      SyncState.retry.wireName,
                    ]),
              )
              ..orderBy([(o) => OrderingTerm.asc(o.createdAt)])
              ..limit(limit))
            .get();
    return rows.map(_toDomain).toList(growable: false);
  }

  /// Claims the oldest outstanding operation by moving it to `SYNCING` and
  /// incrementing the attempt counter.
  ///
  /// Claims `PENDING` or `RETRY` rows, oldest first.
  ///
  /// Claim and state change happen in one transaction so two concurrent callers
  /// cannot both claim the same operation. Returns `null` when nothing is
  /// outstanding for [deviceId].
  Future<QueuedOperation?> claimNext(String deviceId, {DateTime? now}) {
    return _unitOfWork.run(() async {
      final row =
          await (_db.select(_db.syncOperations)
                ..where(
                  (o) =>
                      o.deviceId.equals(deviceId) &
                      o.state.isIn([
                        SyncState.pending.wireName,
                        SyncState.retry.wireName,
                      ]),
                )
                ..orderBy([(o) => OrderingTerm.asc(o.createdAt)])
                ..limit(1))
              .getSingleOrNull();
      if (row == null) return null;

      final current = SyncState.fromWireName(row.state);
      if (!SyncStateMachine.canTransition(current, SyncState.syncing)) {
        throw StateError(
          'Cannot claim operation ${row.operationId} in state '
          '${current.wireName}',
        );
      }

      await (_db.update(
        _db.syncOperations,
      )..where((o) => o.id.equals(row.id))).write(
        SyncOperationsCompanion(
          state: Value(SyncState.syncing.wireName),
          attempts: Value(row.attempts + 1),
          updatedAt: Value(now ?? DateTime.now().toUtc()),
          lastError: const Value.absent(),
        ),
      );

      return _toDomain(
        row.copyWith(
          state: SyncState.syncing.wireName,
          attempts: row.attempts + 1,
          updatedAt: now ?? DateTime.now().toUtc(),
        ),
      );
    });
  }

  /// Moves an operation to a new [state], validating the transition.
  ///
  /// The check-then-write pair runs in one transaction, so an illegal
  /// transition cannot be interleaved with a concurrent update.
  Future<void> transition(
    String rowId,
    SyncState to, {
    String? lastError,
    DateTime? now,
  }) {
    return _unitOfWork.run(() async {
      final row = await (_db.select(
        _db.syncOperations,
      )..where((o) => o.id.equals(rowId))).getSingleOrNull();
      if (row == null) {
        throw StateError('Sync operation not found: $rowId');
      }
      SyncStateMachine.ensureTransition(SyncState.fromWireName(row.state), to);
      await (_db.update(
        _db.syncOperations,
      )..where((o) => o.id.equals(rowId))).write(
        SyncOperationsCompanion(
          state: Value(to.wireName),
          lastError: Value(lastError),
          updatedAt: Value(now ?? DateTime.now().toUtc()),
        ),
      );
    });
  }

  /// Returns `SYNCING` rows for [deviceId] last updated before [staleBefore]
  /// to `PENDING`.
  ///
  /// Without this a device that was killed mid-push would strand the operation
  /// forever. Reclaiming is safe because the server de-duplicates by operation
  /// ID, so a re-push cannot create a second transaction.
  ///
  /// The caller supplies an explicit cutoff rather than a "now", because a now
  /// based cutoff has no age window and would reclaim a row that is merely a
  /// moment old. How long to wait before considering a push abandoned is a
  /// policy decision that belongs to the sync engine, not to the queue.
  Future<int> reclaimStale(String deviceId, {required DateTime staleBefore}) {
    return _unitOfWork.run(() async {
      final rows =
          await (_db.select(_db.syncOperations)..where(
                (o) =>
                    o.deviceId.equals(deviceId) &
                    o.state.equals(SyncState.syncing.wireName) &
                    o.updatedAt.isSmallerThanValue(staleBefore),
              ))
              .get();
      if (rows.isEmpty) return 0;

      for (final row in rows) {
        SyncStateMachine.ensureTransition(
          SyncState.fromWireName(row.state),
          SyncState.pending,
        );
      }

      await (_db.update(_db.syncOperations)..where(
            (o) =>
                o.deviceId.equals(deviceId) &
                o.state.equals(SyncState.syncing.wireName) &
                o.updatedAt.isSmallerThanValue(staleBefore),
          ))
          .write(
            SyncOperationsCompanion(
              state: Value(SyncState.pending.wireName),
              lastError: const Value.absent(),
              updatedAt: Value(staleBefore),
            ),
          );
      return rows.length;
    });
  }

  /// Operation counts per state for [deviceId].
  ///
  /// This is the raw data for the monitoring values in
  /// `brain/OFFLINE_SYNC.md` §Monitoring. Presenting those values is a UI
  /// concern and is not implemented here.
  Future<Map<SyncState, int>> countByState(String deviceId) async {
    final rows = await (_db.select(
      _db.syncOperations,
    )..where((o) => o.deviceId.equals(deviceId))).get();
    final counts = <SyncState, int>{};
    for (final row in rows) {
      final state = SyncState.fromWireName(row.state);
      counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
  }

  /// Reads the stored JSON payload back for an operation.
  Future<Map<String, dynamic>> payloadOf(String rowId) async {
    final row = await (_db.select(
      _db.syncOperations,
    )..where((o) => o.id.equals(rowId))).getSingleOrNull();
    if (row == null) {
      throw StateError('Sync operation not found: $rowId');
    }
    return jsonDecode(row.payload) as Map<String, dynamic>;
  }

  /// A collision-resistant id for the local primary key.
  ///
  /// The *operation* identity is [operationId] and belongs to the caller; this
  /// is only the surrogate row key. A random suffix plus a monotonic counter is
  /// used because two enqueues in the same microsecond must still produce
  /// distinct primary keys.
  String _newId() {
    final random = Random.secure();
    final entropy = List<int>.generate(
      8,
      (_) => random.nextInt(256),
    ).map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return 'sync-${_idCounter++}-$entropy';
  }

  static QueuedOperation _toDomain(SyncOperation row) => QueuedOperation(
    id: row.id,
    deviceId: row.deviceId,
    operationId: row.operationId,
    type: SyncOperationType.fromWireName(row.operationType),
    state: SyncState.fromWireName(row.state),
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  );
}
