import 'package:flutter/foundation.dart';

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
}
