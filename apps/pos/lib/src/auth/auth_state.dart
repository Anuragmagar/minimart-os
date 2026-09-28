import 'package:flutter/foundation.dart';

import '../di/injection.dart';
import '../network/api_client.dart';
import '../network/exceptions.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState extends ChangeNotifier {
  AuthStatus _status = AuthStatus.unknown;
  String? _accessToken;
  String? _refreshToken;

  AuthStatus get status => _status;
  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  bool get isUnknown => _status == AuthStatus.unknown;

  void setAuthenticated(String accessToken, String refreshToken) {
    _status = AuthStatus.authenticated;
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    notifyListeners();
  }

  void setUnauthenticated() {
    _status = AuthStatus.unauthenticated;
    _accessToken = null;
    _refreshToken = null;
    notifyListeners();
  }

  void setUnknown() {
    _status = AuthStatus.unknown;
    notifyListeners();
  }

  void updateAccessToken(String accessToken) {
    _accessToken = accessToken;
  }

  Future<void> logout() async {
    if (_refreshToken != null) {
      try {
        final apiClient = getIt<ApiClient>();
        await apiClient.refreshToken();
        // Note: We call the logout endpoint with the refresh token to revoke it
        await apiClient.dio.post(
          '/auth/logout',
          data: {'refresh_token': _refreshToken},
        );
      } catch (e) {
        // Even if the server call fails, we should still log out locally
        // This handles cases where the server is unreachable
      }
    }
    setUnauthenticated();
  }
}
