import 'package:dio/dio.dart';

import '../auth/auth_state.dart';
import 'exceptions.dart';

class ApiClient {
  final Dio _dio;
  final AuthState _authState;

  ApiClient(this._dio, this._authState) {
    _setupInterceptors();
  }

  Dio get dio => _dio;

  void _setupInterceptors() {
    _dio.interceptors.addAll([
      _AuthInterceptor(_authState),
      _ErrorInterceptor(),
      _LoggingInterceptor(),
    ]);
  }

  Future<LoginResponse> login(String email, String password) async {
    final response = await _dio.post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );

    final data = response.data['data'] as Map<String, dynamic>;
    return LoginResponse.fromJson(data);
  }

  Future<void> refreshToken() async {
    final refreshToken = _authState.refreshToken;
    if (refreshToken == null) {
      throw const AuthException(message: 'No refresh token available');
    }

    try {
      final response = await _dio.post(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
        options: Options(headers: {'Authorization': 'Bearer $refreshToken'}),
      );

      final accessToken = response.data['data']?['access_token'] as String?;
      final newRefreshToken =
          response.data['data']?['refresh_token'] as String?;

      if (accessToken != null) {
        _authState.updateAccessToken(accessToken);
        if (newRefreshToken != null) {
          _authState.setAuthenticated(accessToken, newRefreshToken);
        }
      }
    } catch (e) {
      _authState.setUnauthenticated();
      rethrow;
    }
  }
}

class LoginResponse {
  final String accessToken;
  final String refreshToken;
  final int accessTokenExpiresIn;
  final int refreshTokenExpiresIn;

  LoginResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresIn,
    required this.refreshTokenExpiresIn,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      accessTokenExpiresIn: json['accessTokenExpiresIn'] as int,
      refreshTokenExpiresIn: json['refreshTokenExpiresIn'] as int,
    );
  }
}

class _AuthInterceptor extends Interceptor {
  final AuthState _authState;

  _AuthInterceptor(this._authState);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _authState.accessToken;
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}

class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response != null) {
      final statusCode = err.response!.statusCode;
      final data = err.response!.data;

      if (statusCode == 401) {
        handler.reject(
          DioException(
            requestOptions: err.requestOptions,
            response: err.response,
            type: DioExceptionType.badResponse,
            error: const AuthException(message: 'Unauthorized'),
          ),
        );
        return;
      }

      if (statusCode == 400 &&
          data is Map &&
          data['error']?['code'] == 'VALIDATION_FAILED') {
        handler.reject(
          DioException(
            requestOptions: err.requestOptions,
            response: err.response,
            type: DioExceptionType.badResponse,
            error: AppException.fromJson(
              data as Map<String, dynamic>,
              statusCode: statusCode,
            ),
          ),
        );
        return;
      }

      if (data is Map) {
        handler.reject(
          DioException(
            requestOptions: err.requestOptions,
            response: err.response,
            type: DioExceptionType.badResponse,
            error: AppException.fromJson(
              data as Map<String, dynamic>,
              statusCode: statusCode,
            ),
          ),
        );
        return;
      }
    }

    handler.next(err);
  }
}

class _LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    // In production, use a proper logger
    // log('REQUEST[${options.method}] ${options.path}');
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    // log('RESPONSE[${response.statusCode}] ${response.requestOptions.path}');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // log('ERROR[${err.response?.statusCode}] ${err.requestOptions.path}: ${err.message}');
    handler.next(err);
  }
}
