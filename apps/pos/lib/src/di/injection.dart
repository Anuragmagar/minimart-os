import 'package:drift/drift.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import 'package:injectable/injectable.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../auth/secure_token_storage.dart';
import '../database/app_database.dart';
import 'injection.config.dart';

final getIt = GetIt.instance;

@InjectableInit(
  initializerName: r'$initGetIt',
  preferRelativeImports: true,
  asExtension: false,
)
void configureDependencies({
  SharedPreferences? sharedPreferencesOverride,
  QueryExecutor? databaseExecutorOverride,
}) {
  $initGetIt(getIt);
  if (sharedPreferencesOverride != null) {
    getIt.registerSingleton<SharedPreferences>(sharedPreferencesOverride);
  }
  getIt.registerLazySingleton<FlutterSecureStorage>(() => const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  ));
  getIt.registerLazySingleton<SecureTokenStorage>(() => SecureTokenStorage.create());
  if (databaseExecutorOverride != null) {
    // Tests supply an in-memory executor so they never touch the on-disk file
    // and never contend for the same connection. DatabaseService is a lazy
    // singleton, so it resolves whichever AppDatabase ends up registered here.
    if (getIt.isRegistered<AppDatabase>()) {
      getIt.unregister<AppDatabase>();
    }
    getIt.registerSingleton<AppDatabase>(
      AppDatabase.forTesting(databaseExecutorOverride),
    );
  }
}
