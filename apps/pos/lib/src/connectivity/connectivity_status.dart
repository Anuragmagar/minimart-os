/// Reachability state of the POS with respect to the MiniMart server.
///
/// "Connected" here means the server could actually be reached, not merely that
/// a network interface is up. A retail counter frequently has a wired link with
/// no upstream, and an interface-up signal would then wrongly report that sync
/// is possible. `brain/OFFLINE_SYNC.md` §Principle requires the POS to stay
/// usable without internet, so the service reports what the server is reachable
/// for and leaves the decision to the caller.
enum ConnectivityStatus {
  /// No probe has completed yet.
  ///
  /// Deliberately distinct from both [online] and [offline]: before the first
  /// probe the service knows nothing, and assuming either value would let a
  /// caller start a sync it cannot finish or hide an outage from the operator.
  unknown,

  /// The server accepted a connection.
  online,

  /// The server could not be reached within the probe timeout.
  offline;

  /// Whether a sync attempt could plausibly succeed.
  ///
  /// [unknown] is treated as not reachable so that a caller which ignores it
  /// fails safe: attempting nothing is recoverable, an endless failing push
  /// loop is not.
  bool get canSync => this == ConnectivityStatus.online;
}
