import 'package:dio/dio.dart';

class AppException implements Exception {
  final String code;
  final String message;
  final Map<String, dynamic>? details;
  final Map<String, List<String>>? fieldErrors;
  final String? requestId;
  final int? statusCode;

  const AppException({
    required this.code,
    required this.message,
    this.details,
    this.fieldErrors,
    this.requestId,
    this.statusCode,
  });

  factory AppException.fromJson(Map<String, dynamic> json, {int? statusCode}) {
    final error = json['error'] as Map<String, dynamic>?;
    if (error == null) {
      return AppException(
        code: 'UNKNOWN_ERROR',
        message: json['message']?.toString() ?? 'Unknown error',
        statusCode: statusCode,
      );
    }
    return AppException(
      code: error['code'] as String? ?? 'UNKNOWN_ERROR',
      message: error['message'] as String? ?? 'Unknown error',
      details: error['details'] as Map<String, dynamic>?,
      fieldErrors: (error['field_errors'] as Map<String, dynamic>?)?.map(
        (key, value) => MapEntry(
          key,
          (value as List<dynamic>).map((e) => e.toString()).toList(),
        ),
      ),
      requestId: error['request_id'] as String?,
      statusCode: statusCode,
    );
  }

  @override
  String toString() =>
      'AppException(code: $code, message: $message, statusCode: $statusCode)';
}

class NetworkException extends AppException {
  const NetworkException({
    required super.message,
    super.code = 'NETWORK_ERROR',
    super.details,
    super.requestId,
    super.statusCode,
  });

  factory NetworkException.fromDioError(DioException e) {
    return NetworkException(
      message: _getMessage(e),
      code: _getCode(e),
      statusCode: e.response?.statusCode,
      requestId: e.response?.headers.value('x-request-id'),
    );
  }

  static String _getMessage(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Connection timeout. Please check your network.';
      case DioExceptionType.badResponse:
        return 'Server error: ${e.response?.statusCode}';
      case DioExceptionType.cancel:
        return 'Request cancelled';
      case DioExceptionType.connectionError:
        return 'Network connection failed. Please check your internet connection.';
      default:
        return 'Network error: ${e.message}';
    }
  }

  static String _getCode(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'TIMEOUT';
      case DioExceptionType.badResponse:
        return 'HTTP_${e.response?.statusCode}';
      case DioExceptionType.cancel:
        return 'CANCELLED';
      case DioExceptionType.connectionError:
        return 'CONNECTION_ERROR';
      default:
        return 'NETWORK_ERROR';
    }
  }
}

class AuthException extends AppException {
  const AuthException({
    required super.message,
    super.code = 'AUTH_ERROR',
    super.details,
    super.requestId,
    super.statusCode = 401,
  });
}

class ValidationException extends AppException {
  const ValidationException({
    required super.message,
    required super.fieldErrors,
    super.code = 'VALIDATION_FAILED',
    super.details,
    super.requestId,
    super.statusCode = 400,
  });
}
