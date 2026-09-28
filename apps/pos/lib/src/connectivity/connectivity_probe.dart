import 'dart:io';

/// Determines whether the MiniMart server is reachable.
abstract interface class ConnectivityProbe {
  /// Completes with `true` when a connection succeeded, `false` otherwise.
  ///
  /// Implementations must not throw for an unreachable server: an unreachable
  /// server is an expected condition, not an error condition.
  Future<bool> isReachable();
}

/// Reachability probe that opens a TCP connection to the API host.
///
/// A TCP connect is used rather than an HTTP request because this runs on a
/// timer and on every connectivity change. An HTTP probe would consume a
/// request against a business endpoint, and per
/// `brain/OFFLINE_SYNC.md` §Core Rule the sync surface must push business
/// operations rather than be spammed with liveness traffic.
///
/// The host and port come from the existing API base URL so the probe cannot
/// drift from where the app actually sends requests.
class SocketConnectivityProbe implements ConnectivityProbe {
  final String host;
  final int port;
  final Duration timeout;

  const SocketConnectivityProbe({
    required this.host,
    required this.port,
    this.timeout = const Duration(seconds: 5),
  });

  @override
  Future<bool> isReachable() async {
    Socket? socket;
    try {
      socket = await Socket.connect(host, port, timeout: timeout);
      return true;
    } on Object {
      // Covers SocketException, TimeoutException, and any host-resolution
      // failure. Reachability is reported as a value, never as an exception.
      return false;
    } finally {
      socket?.destroy();
    }
  }
}
