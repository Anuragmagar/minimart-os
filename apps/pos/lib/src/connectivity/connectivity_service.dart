import 'dart:async';

import 'connectivity_probe.dart';
import 'connectivity_status.dart';

/// Tracks whether the MiniMart server is reachable and reports changes.
///
/// Scope is state and change notification only. Deciding *what* to do when
/// connectivity changes, such as starting a sync, is a sync-trigger policy
/// belonging to the offline-sync workstream (`brain/OFFLINE_SYNC.md`
/// §Sync Triggers), so this service does not trigger anything itself.
///
/// Three behaviours matter for a POS on a flaky counter link:
///
/// * it starts [ConnectivityStatus.unknown], so nothing is assumed before the
///   first probe;
/// * it emits only on a genuine change, so a flapping link does not produce an
///   event storm for whoever is listening;
/// * it coalesces concurrent probes, so a periodic tick and a manual check
///   cannot both open a socket for the same moment.
class ConnectivityService {
  final ConnectivityProbe _probe;
  final Duration _pollInterval;

  final StreamController<ConnectivityStatus> _changes =
      StreamController<ConnectivityStatus>.broadcast();

  ConnectivityStatus _status = ConnectivityStatus.unknown;
  Timer? _timer;
  bool _running = false;
  bool _disposed = false;

  /// Set while a probe is in flight so a second caller awaits that same probe
  /// instead of starting another.
  Future<bool>? _inFlight;

  /// Extra wait applied while offline, so a long outage is not probed as often
  /// as a healthy link.
  ///
  /// A fixed constant rather than configuration: no value is specified anywhere
  /// in the project documents, and adding an undocumented tunable would exceed
  /// this task.
  static const Duration offlineBackoff = Duration(seconds: 15);

  // Initializing formals would rename the parameters to `_probe` and
  // `_pollInterval`, which callers outside this library cannot pass.
  // ignore_for_file: prefer_initializing_formals

  ConnectivityService({
    required ConnectivityProbe probe,
    Duration pollInterval = const Duration(seconds: 30),
  }) : _probe = probe,
       _pollInterval = pollInterval;

  /// The most recent known state.
  ConnectivityStatus get status => _status;

  /// Whether at least one probe has completed.
  bool get hasResult => _status != ConnectivityStatus.unknown;

  /// Whether periodic probing is running.
  bool get isRunning => _running;

  /// State changes, seeded with the current state on subscription.
  ///
  /// A listener attaching after startup still learns the current state, and a
  /// listener attaching immediately does not receive a spurious pair.
  ///
  /// The subscription is established *before* the current state is read, and
  /// both happen synchronously. An `async*` generator cannot do this: it
  /// suspends at the first `yield`, so any transition occurring before the
  /// underlying stream is subscribed would be lost. A broadcast controller does
  /// not replay, so that loss is permanent and an operator could miss an outage
  /// entirely. Because Dart is single-threaded and no `await` separates the
  /// subscribe and the read, the seed can never be stale relative to the
  /// subscription.
  Stream<ConnectivityStatus> get changes =>
      Stream<ConnectivityStatus>.multi((controller) {
        final subscription = _changes.stream.listen(
          controller.add,
          onError: controller.addError,
          onDone: controller.close,
        );
        controller.onCancel = subscription.cancel;
        controller.add(_status);
      });

  /// Starts periodic probing, probing once immediately. Idempotent.
  void start() {
    _ensureUsable();
    if (_running) return;
    _running = true;
    unawaited(checkNow());
  }

  /// Stops periodic probing. The last known status is retained.
  void stop() {
    _running = false;
    _timer?.cancel();
    _timer = null;
  }

  /// Probes immediately and returns the resulting state.
  ///
  /// Concurrent calls share a single in-flight probe.
  Future<ConnectivityStatus> checkNow() async {
    _ensureUsable();

    final pending = _inFlight;
    if (pending != null) {
      await pending;
      return _status;
    }

    final probe = _probe.isReachable();
    _inFlight = probe;
    try {
      final reachable = await probe;
      _apply(reachable);
      return _status;
    } finally {
      _inFlight = null;
      _scheduleNext();
    }
  }

  /// Releases resources. The service cannot be restarted afterwards.
  Future<void> dispose() async {
    stop();
    _disposed = true;
    await _changes.close();
  }

  /// Arms the next poll. Chained one-shot timers rather than `Timer.periodic`
  /// so the offline backoff can vary the interval.
  void _scheduleNext() {
    if (!_running || _disposed) return;
    _timer?.cancel();
    final delay = _status == ConnectivityStatus.offline
        ? _pollInterval + offlineBackoff
        : _pollInterval;
    _timer = Timer(delay, () {
      _timer = null;
      unawaited(checkNow());
    });
  }

  void _apply(bool reachable) {
    final next = reachable
        ? ConnectivityStatus.online
        : ConnectivityStatus.offline;
    if (next == _status) return;
    _status = next;
    _changes.add(next);
  }

  void _ensureUsable() {
    if (_disposed) {
      throw StateError('ConnectivityService has been disposed');
    }
  }
}
