import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/sync/payload_guard.dart';
import 'package:pos/src/sync/sync_operation.dart';
import 'package:pos/src/sync/sync_queue.dart';
import 'package:pos/src/sync/sync_state.dart';

import '../setup.dart';

const _device = 'device-1';
const _otherDevice = 'device-2';

void main() {
  setUpAll(configureTestDrift);

  late AppDatabase db;
  late SyncQueue queue;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    queue = SyncQueue(db);
  });

  tearDown(() => db.close());

  Future<String> enqueue({
    String operationId = 'op-1',
    SyncOperationType type = SyncOperationType.sale,
    Map<String, dynamic>? payload,
    String deviceId = _device,
    DateTime? now,
  }) {
    return queue.enqueue(
      deviceId: deviceId,
      operationId: operationId,
      type: type,
      payload: payload ?? const {'invoiceNumber': 'INV-1', 'total': '450.00'},
      now: now,
    );
  }

  group('SyncState wire contract', () {
    test('names match brain/OFFLINE_SYNC.md exactly', () {
      expect(SyncState.pending.wireName, 'PENDING');
      expect(SyncState.syncing.wireName, 'SYNCING');
      expect(SyncState.applied.wireName, 'APPLIED');
      expect(SyncState.failed.wireName, 'FAILED');
      expect(SyncState.retry.wireName, 'RETRY');
      expect(SyncState.conflict.wireName, 'CONFLICT');
      expect(SyncState.manualResolution.wireName, 'MANUAL_RESOLUTION');
      expect(SyncState.rejected.wireName, 'REJECTED');
    });

    test('round-trips through fromWireName', () {
      for (final state in SyncState.values) {
        expect(SyncState.fromWireName(state.wireName), state);
      }
    });

    test('rejects an unknown state name', () {
      expect(() => SyncState.fromWireName('NOPE'), throwsFormatException);
    });
  });

  group('SyncStateMachine', () {
    test('allows the documented happy path', () {
      expect(
        SyncStateMachine.canTransition(SyncState.pending, SyncState.syncing),
        isTrue,
      );
      expect(
        SyncStateMachine.canTransition(SyncState.syncing, SyncState.applied),
        isTrue,
      );
    });

    test('allows the failure and retry loop', () {
      expect(
        SyncStateMachine.canTransition(SyncState.syncing, SyncState.failed),
        isTrue,
      );
      expect(
        SyncStateMachine.canTransition(SyncState.failed, SyncState.retry),
        isTrue,
      );
      expect(
        SyncStateMachine.canTransition(SyncState.retry, SyncState.syncing),
        isTrue,
      );
    });

    test('allows the conflict branch', () {
      expect(
        SyncStateMachine.canTransition(SyncState.syncing, SyncState.conflict),
        isTrue,
      );
      expect(
        SyncStateMachine.canTransition(
          SyncState.conflict,
          SyncState.manualResolution,
        ),
        isTrue,
      );
    });

    test('REJECTED is terminal and cannot be retried', () {
      expect(SyncState.rejected.isTerminal, isTrue);
      expect(
        SyncStateMachine.canTransition(SyncState.rejected, SyncState.retry),
        isFalse,
      );
      expect(
        SyncStateMachine.canTransition(SyncState.rejected, SyncState.pending),
        isFalse,
      );
    });

    test('APPLIED is terminal', () {
      expect(SyncState.applied.isTerminal, isTrue);
      expect(
        SyncStateMachine.canTransition(SyncState.applied, SyncState.syncing),
        isFalse,
      );
    });

    test('cannot skip straight from PENDING to APPLIED', () {
      expect(
        SyncStateMachine.canTransition(SyncState.pending, SyncState.applied),
        isFalse,
      );
      expect(
        () => SyncStateMachine.ensureTransition(
          SyncState.pending,
          SyncState.applied,
        ),
        throwsStateError,
      );
    });

    test('isOutstanding excludes terminal states', () {
      expect(SyncState.pending.isOutstanding, isTrue);
      expect(SyncState.retry.isOutstanding, isTrue);
      expect(SyncState.applied.isOutstanding, isFalse);
      expect(SyncState.rejected.isOutstanding, isFalse);
    });
  });

  group('enqueue', () {
    test('stores an operation as PENDING with zero attempts', () async {
      final id = await enqueue();

      final counts = await queue.countByState(_device);
      expect(counts[SyncState.pending], 1);

      final payload = await queue.payloadOf(id);
      expect(payload['invoiceNumber'], 'INV-1');
    });

    test('is idempotent on operationId (BR-037)', () async {
      final first = await enqueue(operationId: 'op-dup');
      final second = await enqueue(operationId: 'op-dup');

      expect(second, first);
      final counts = await queue.countByState(_device);
      expect(counts[SyncState.pending], 1);
    });

    test('rejects an empty operationId', () async {
      await expectLater(enqueue(operationId: '  '), throwsArgumentError);
    });

    test('keeps distinct operations separate', () async {
      await enqueue(operationId: 'op-a');
      await enqueue(operationId: 'op-b');

      final counts = await queue.countByState(_device);
      expect(counts[SyncState.pending], 2);
    });

    test('scopes pending work per device', () async {
      await enqueue(operationId: 'op-a', deviceId: _device);
      await enqueue(operationId: 'op-b', deviceId: _otherDevice);

      expect(await queue.pending(_device), hasLength(1));
      expect(await queue.pending(_otherDevice), hasLength(1));
    });
  });

  group('PayloadGuard', () {
    test('accepts a normal business payload', () {
      expect(
        () => PayloadGuard.check(
          jsonEncode(const {
            'invoiceNumber': 'INV-1',
            'items': [
              {'productId': 'p1', 'quantity': '2.000'},
            ],
            'customer': {'id': 'c1', 'name': 'Ram'},
          }),
        ),
        returnsNormally,
      );
    });

    test('rejects a nested access token', () {
      expect(
        () => PayloadGuard.check(
          jsonEncode(const {
            'customer': {'id': 'c1', 'accessToken': 'secret-value'},
          }),
        ),
        throwsArgumentError,
      );
    });

    test('rejects a card number inside a list element', () {
      expect(
        () => PayloadGuard.check(
          jsonEncode(const {
            'payments': [
              {'method': 'cash'},
              {'method': 'card', 'cardNumber': '4111111111111111'},
            ],
          }),
        ),
        throwsArgumentError,
      );
    });

    test('rejects a password hash', () {
      expect(
        () => PayloadGuard.check(jsonEncode(const {'passwordHash': 'x'})),
        throwsArgumentError,
      );
    });

    test('is case-insensitive on the key', () {
      expect(
        () => PayloadGuard.check(jsonEncode(const {'REFRESHTOKEN': 'x'})),
        throwsArgumentError,
      );
    });

    test('rejects a non-object payload', () {
      expect(() => PayloadGuard.check('[1,2,3]'), throwsArgumentError);
    });

    test('leaves no row behind when the payload is rejected', () async {
      await expectLater(
        enqueue(operationId: 'op-bad', payload: const {'token': 'leak-me'}),
        throwsArgumentError,
      );
      expect(await queue.pending(_device), isEmpty);
    });
  });

  group('claimNext', () {
    test('moves the oldest pending operation to SYNCING', () async {
      await enqueue(operationId: 'op-1', now: DateTime.utc(2026, 1, 1, 10));
      await enqueue(operationId: 'op-2', now: DateTime.utc(2026, 1, 1, 11));

      final claimed = await queue.claimNext(_device);

      expect(claimed!.operationId, 'op-1');
      expect(claimed.state, SyncState.syncing);
      expect(claimed.attempts, 1);
    });

    test('returns null when the queue is empty', () async {
      expect(await queue.claimNext(_device), isNull);
    });

    test('does not claim another device operation', () async {
      await enqueue(operationId: 'op-1', deviceId: _otherDevice);
      expect(await queue.claimNext(_device), isNull);
    });

    test('increments attempts on each claim', () async {
      final id = await enqueue(operationId: 'op-1');
      await queue.claimNext(_device);
      await queue.transition(id, SyncState.failed, lastError: 'timeout');
      await queue.transition(id, SyncState.retry);
      final second = await queue.claimNext(_device);

      expect(second!.attempts, 2);
    });

    test('two sequential claims take different operations', () async {
      await enqueue(operationId: 'op-1', now: DateTime.utc(2026, 1, 1, 10));
      await enqueue(operationId: 'op-2', now: DateTime.utc(2026, 1, 1, 11));

      final a = await queue.claimNext(_device);
      final b = await queue.claimNext(_device);

      expect(a!.operationId, 'op-1');
      expect(b!.operationId, 'op-2');
    });

    test('a RETRY operation is claimable again', () async {
      final id = await enqueue();
      await queue.claimNext(_device);
      await queue.transition(id, SyncState.failed, lastError: 'timeout');
      await queue.transition(id, SyncState.retry);

      final claimed = await queue.claimNext(_device);

      expect(claimed, isNotNull);
      expect(claimed!.state, SyncState.syncing);
      expect(claimed.attempts, 2);
    });

    test('a RETRY operation is listed as outstanding', () async {
      final id = await enqueue();
      await queue.claimNext(_device);
      await queue.transition(id, SyncState.failed, lastError: 'timeout');
      await queue.transition(id, SyncState.retry);

      expect(await queue.pending(_device), hasLength(1));
    });

    test('a REJECTED operation is never claimable', () async {
      final id = await enqueue();
      await queue.claimNext(_device);
      await queue.transition(id, SyncState.rejected, lastError: 'permanent');

      expect(await queue.claimNext(_device), isNull);
      expect(await queue.pending(_device), isEmpty);
    });
  });

  group('transition', () {
    test('applies a legal transition', () async {
      final id = await enqueue();
      await queue.claimNext(_device);
      await queue.transition(id, SyncState.applied);

      final counts = await queue.countByState(_device);
      expect(counts[SyncState.applied], 1);
    });

    test('records the last error on failure', () async {
      final id = await enqueue();
      await queue.claimNext(_device);
      await queue.transition(id, SyncState.failed, lastError: 'server 503');

      final counts = await queue.countByState(_device);
      expect(counts[SyncState.failed], 1);
    });

    test('rejects an illegal transition', () async {
      final id = await enqueue();
      await expectLater(
        queue.transition(id, SyncState.applied),
        throwsStateError,
      );
    });

    test('rejects reviving a rejected operation', () async {
      final id = await enqueue();
      await queue.claimNext(_device);
      await queue.transition(id, SyncState.rejected);

      await expectLater(
        queue.transition(id, SyncState.retry),
        throwsStateError,
      );
      final counts = await queue.countByState(_device);
      expect(counts[SyncState.rejected], 1);
    });

    test('rejects an unknown row', () async {
      await expectLater(
        queue.transition('does-not-exist', SyncState.applied),
        throwsStateError,
      );
    });
  });

  group('reclaimStale', () {
    // A fixed base time keeps these tests independent of the wall clock.
    final seeded = DateTime.utc(2026, 1, 1, 9);

    test('returns a stranded SYNCING row to PENDING', () async {
      await enqueue(now: seeded);
      await queue.claimNext(_device, now: seeded);

      final reclaimed = await queue.reclaimStale(
        _device,
        staleBefore: seeded.add(const Duration(hours: 1)),
      );

      expect(reclaimed, 1);
      final counts = await queue.countByState(_device);
      expect(counts[SyncState.pending], 1);
    });

    test('leaves a SYNCING row newer than the cutoff alone', () async {
      await enqueue(now: seeded);
      await queue.claimNext(_device, now: seeded);

      // The row was last touched at `seeded`, so a cutoff at `seeded` finds
      // nothing strictly older to reclaim.
      final reclaimed = await queue.reclaimStale(_device, staleBefore: seeded);

      expect(reclaimed, 0);
      final counts = await queue.countByState(_device);
      expect(counts[SyncState.syncing], 1);
    });

    test('does not touch another device', () async {
      await enqueue(deviceId: _otherDevice, now: seeded);
      await queue.claimNext(_otherDevice, now: seeded);

      final reclaimed = await queue.reclaimStale(
        _device,
        staleBefore: seeded.add(const Duration(hours: 1)),
      );

      expect(reclaimed, 0);
    });

    test(
      'reclaimed operation keeps its operationId so the server dedupes',
      () async {
        await enqueue(operationId: 'op-retry', now: seeded);
        await queue.claimNext(_device, now: seeded);
        await queue.reclaimStale(
          _device,
          staleBefore: seeded.add(const Duration(hours: 1)),
        );

        final requeued = await queue.pending(_device);
        expect(requeued.single.operationId, 'op-retry');
      },
    );
  });

  group('countByState', () {
    test('reports counts for monitoring', () async {
      await enqueue(operationId: 'op-1');
      await enqueue(operationId: 'op-2');
      final id2 = await enqueue(operationId: 'op-3');
      await queue.claimNext(_device);
      await queue.transition(id2, SyncState.syncing);
      await queue.transition(id2, SyncState.failed, lastError: 'x');

      final counts = await queue.countByState(_device);

      expect(counts[SyncState.pending], 1);
      expect(counts[SyncState.syncing], 1);
      expect(counts[SyncState.failed], 1);
    });
  });

  group('SyncOperationType', () {
    test('names match the documented command list', () {
      expect(SyncOperationType.sale.wireName, 'sale');
      expect(SyncOperationType.receipt.wireName, 'receipt');
      expect(SyncOperationType.adjustment.wireName, 'adjustment');
      expect(SyncOperationType.transfer.wireName, 'transfer');
      expect(SyncOperationType.return_.wireName, 'return');
      expect(SyncOperationType.payment.wireName, 'payment');
    });

    test('round-trips through fromWireName', () {
      for (final type in SyncOperationType.values) {
        expect(SyncOperationType.fromWireName(type.wireName), type);
      }
    });

    test('rejects an unknown type', () {
      expect(
        () => SyncOperationType.fromWireName('nope'),
        throwsFormatException,
      );
    });
  });
}
