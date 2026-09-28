import 'package:injectable/injectable.dart';

import 'auth_state.dart';

@module
abstract class AuthModule {
  @singleton
  AuthState authState() => AuthState();
}
