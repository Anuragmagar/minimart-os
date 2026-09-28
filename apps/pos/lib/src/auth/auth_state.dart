import 'package:flutter/foundation.dart';

import '../di/injection.dart';
import '../network/api_client.dart';
import '../network/exceptions.dart';
import 'secure_token_storage.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState extends ChangeNotifier {
  AuthStatus _status = AuthStatus.unknown;
  String? _accessToken;
  String? _refreshToken;
  final SecureTokenStorage _tokenStorage = SecureTokenStorage.create();

  AuthStatus get status => _status;
  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  bool get isUnknown => _status == AuthStatus.unknown;

  Future<void> initialize() async {
    final hasValidTokens = await _tokenStorage.hasValidTokens();
    if (hasValidTokens) {
      _accessToken = await _tokenStorage.getAccessToken();
      _refreshToken = await _tokenStorage.getRefreshToken();
      _status = AuthStatus.authenticated;
    } else {
      await _tokenStorage.clearTokens();
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> setAuthenticated(
    String accessToken,
    String refreshToken,
    DateTime accessTokenExpiry,
    DateTime refreshTokenExpiry,
  ) async {
    await _tokenStorage.saveTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
      accessTokenExpiry: accessTokenExpiry,
      refreshTokenExpiry: refreshTokenExpiry,
    );
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    _status = AuthStatus.authenticated;
    notifyListeners();
  }

  Future<void> setUnauthenticated() async {
    await _tokenStorage.clearTokens();
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
    await setUnauthenticated();
  }

  Future<void> refreshAccessTokenIfNeeded() async {
    final isExpired = await _tokenStorage.isAccessTokenExpired();
    if (!isExpired) return;

    try {
      final apiClient = getIt<ApiClient>();
      await apiClient.refreshToken();
    } catch (e) {
      await setUnauthenticated();
      rethrow;
    }
  }
}
