import 'package:get_it/get_it.dart';
import 'package:injectable/injectable.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'injection.config.dart';

final getIt = GetIt.instance;

@InjectableInit(
  initializerName: r'$initGetIt',
  preferRelativeImports: true,
  asExtension: false,
)
void configureDependencies({SharedPreferences? sharedPreferencesOverride}) {
  $initGetIt(getIt);
  if (sharedPreferencesOverride != null) {
    getIt.registerSingleton<SharedPreferences>(sharedPreferencesOverride);
  }
}
