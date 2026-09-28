import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

import '../auth/auth_state.dart';
import 'api_client.dart';

@module
abstract class NetworkModule {
  @singleton
  Dio dio() => Dio(
    BaseOptions(
      baseUrl: 'http://localhost:3000/api/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  @singleton
  ApiClient apiClient(Dio dio, AuthState authState) =>
      ApiClient(dio, authState);
}
