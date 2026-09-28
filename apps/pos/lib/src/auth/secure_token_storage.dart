import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureTokenStorage {
  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _accessTokenExpiryKey = 'access_token_expiry';
  static const String _refreshTokenExpiryKey = 'refresh_token_expiry';

  final FlutterSecureStorage _storage;

  SecureTokenStorage(this._storage);

  factory SecureTokenStorage.create() {
    return SecureTokenStorage(const FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
      iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
    ));
  }

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    required DateTime accessTokenExpiry,
    required DateTime refreshTokenExpiry,
  }) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
      _storage.write(key: _accessTokenExpiryKey, value: accessTokenExpiry.toIso8601String()),
      _storage.write(key: _refreshTokenExpiryKey, value: refreshTokenExpiry.toIso8601String()),
    ]);
  }

  Future<String?> getAccessToken() async {
    return _storage.read(key: _accessTokenKey);
  }

  Future<String?> getRefreshToken() async {
    return _storage.read(key: _refreshTokenKey);
  }

  Future<DateTime?> getAccessTokenExpiry() async {
    final value = await _storage.read(key: _accessTokenExpiryKey);
    if (value == null) return null;
    return DateTime.tryParse(value);
  }

  Future<DateTime?> getRefreshTokenExpiry() async {
    final value = await _storage.read(key: _refreshTokenExpiryKey);
    if (value == null) return null;
    return DateTime.tryParse(value);
  }

  Future<bool> isAccessTokenExpired() async {
    final expiry = await getAccessTokenExpiry();
    if (expiry == null) return true;
    return DateTime.now().isAfter(expiry);
  }

  Future<bool> isRefreshTokenExpired() async {
    final expiry = await getRefreshTokenExpiry();
    if (expiry == null) return true;
    return DateTime.now().isAfter(expiry);
  }

  Future<bool> hasValidTokens() async {
    final accessToken = await getAccessToken();
    final refreshToken = await getRefreshToken();
    if (accessToken == null || refreshToken == null) return false;
    final accessExpired = await isAccessTokenExpired();
    final refreshExpired = await isRefreshTokenExpired();
    return !accessExpired && !refreshExpired;
  }

  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _accessTokenExpiryKey),
      _storage.delete(key: _refreshTokenExpiryKey),
    ]);
  }

  Future<void> clearAccessToken() async {
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _accessTokenExpiryKey);
  }

  Future<void> clearRefreshToken() async {
    await _storage.delete(key: _refreshTokenKey);
    await _storage.delete(key: _refreshTokenExpiryKey);
  }
}