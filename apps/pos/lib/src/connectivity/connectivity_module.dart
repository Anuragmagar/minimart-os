import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

import '../connectivity/connectivity_probe.dart';
import '../connectivity/connectivity_service.dart';

/// Dependency wiring for connectivity detection.
///
/// The probe target is derived from the same `Dio` base URL the app sends
/// business requests to, so reachability is measured against the real server
/// instead of a separately configured host that could drift out of sync.
@module
abstract class ConnectivityModule {
  @singleton
  ConnectivityProbe connectivityProbe(Dio dio) {
    final uri = Uri.parse(dio.options.baseUrl);
    return SocketConnectivityProbe(
      host: uri.host,
      port: uri.hasPort ? uri.port : _defaultPort(uri.scheme),
    );
  }

  /// Registered as a lazy singleton and deliberately not started here.
  ///
  /// Probing begins only when something calls [ConnectivityService.start], so
  /// construction of the container never opens a socket as a side effect.
  @lazySingleton
  ConnectivityService connectivityService(ConnectivityProbe probe) =>
      ConnectivityService(probe: probe);

  static int _defaultPort(String scheme) => scheme == 'https' ? 443 : 80;
}
