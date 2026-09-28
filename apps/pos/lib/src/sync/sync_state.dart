/// Lifecycle states for a queued sync operation.
///
/// Values are persisted verbatim in `SyncOperations.state`, so the strings are
/// part of the local storage contract and must not be renamed without a schema
/// migration. The set is taken directly from `brain/OFFLINE_SYNC.md` §Sync
/// States; no state was added or removed.
enum SyncState {
  pending('PENDING'),
  syncing('SYNCING'),
  applied('APPLIED'),
  failed('FAILED'),
  retry('RETRY'),
  conflict('CONFLICT'),
  manualResolution('MANUAL_RESOLUTION'),
  rejected('REJECTED');

  const SyncState(this.wireName);

  /// The exact string written to the database column.
  final String wireName;

  static SyncState fromWireName(String value) {
    for (final state in SyncState.values) {
      if (state.wireName == value) return state;
    }
    throw FormatException('Unknown sync state: $value');
  }

  /// States that are finished and will never be retried automatically.
  bool get isTerminal =>
      this == SyncState.applied || this == SyncState.rejected;

  /// States holding an operation that has not reached the server yet.
  bool get isOutstanding =>
      this == SyncState.pending ||
      this == SyncState.retry ||
      this == SyncState.syncing;
}

/// Validates the `PENDING -> SYNCING -> APPLIED` lifecycle from
/// `brain/OFFLINE_SYNC.md` §Sync States, plus the `FAILED -> RETRY` and
/// `CONFLICT -> MANUAL_RESOLUTION` branches.
///
/// Enforcing transitions in one place stops a retry path from quietly moving a
/// `REJECTED` operation back into the queue, which would retry a permanent
/// business error forever and violate §Retry ("do not endlessly retry
/// permanent business errors").
class SyncStateMachine {
  const SyncStateMachine._();

  /// Allowed transitions, keyed by the state being left.
  static const Map<SyncState, Set<SyncState>> allowed = {
    SyncState.pending: {
      SyncState.syncing,
      // An operation can be rejected by a validation pass before any push
      // attempt, e.g. a payload that fails a local business precondition.
      SyncState.rejected,
    },
    SyncState.syncing: {
      SyncState.applied,
      SyncState.failed,
      SyncState.conflict,
      SyncState.rejected,
      // Crash recovery: a device that died mid-push leaves a SYNCING row
      // behind. Reclaiming it to PENDING is the only backward edge, and the
      // server still de-duplicates by operation ID (BR-038), so the reclaim
      // cannot produce a duplicate transaction.
      SyncState.pending,
    },
    SyncState.failed: {SyncState.retry},
    SyncState.retry: {SyncState.syncing},
    SyncState.conflict: {SyncState.manualResolution},
    SyncState.manualResolution: {SyncState.applied, SyncState.rejected},
    SyncState.applied: <SyncState>{},
    SyncState.rejected: <SyncState>{},
  };

  static bool canTransition(SyncState from, SyncState to) =>
      allowed[from]!.contains(to);

  /// Throws unless [from] -> [to] is a legal transition.
  static void ensureTransition(SyncState from, SyncState to) {
    if (!canTransition(from, to)) {
      throw StateError(
        'Illegal sync transition ${from.wireName} -> ${to.wireName}',
      );
    }
  }
}
