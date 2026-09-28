import 'sync_state.dart';

/// The kinds of business operation the outbox can hold.
///
/// `brain/OFFLINE_SYNC.md` §Core Rule is "synchronize business operations, not
/// arbitrary database state", so this is a closed list of business commands
/// rather than a generic table/row transport.
enum SyncOperationType {
  sale('sale'),
  receipt('receipt'),
  adjustment('adjustment'),
  transfer('transfer'),
  return_('return'),
  payment('payment');

  const SyncOperationType(this.wireName);

  final String wireName;

  static SyncOperationType fromWireName(String value) {
    for (final type in SyncOperationType.values) {
      if (type.wireName == value) return type;
    }
    throw FormatException('Unknown sync operation type: $value');
  }
}

/// A queued operation, as the queue exposes it to callers.
class QueuedOperation {
  final String id;
  final String deviceId;
  final String operationId;
  final SyncOperationType type;
  final SyncState state;
  final int attempts;
  final String? lastError;
  final DateTime createdAt;
  final DateTime updatedAt;

  const QueuedOperation({
    required this.id,
    required this.deviceId,
    required this.operationId,
    required this.type,
    required this.state,
    required this.attempts,
    required this.createdAt,
    required this.updatedAt,
    this.lastError,
  });
}
