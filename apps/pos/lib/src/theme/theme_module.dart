import 'package:shared_preferences/shared_preferences.dart';
import 'package:injectable/injectable.dart';

import 'theme_provider.dart';

@module
abstract class ThemeModule {
  @singleton
  Future<ThemeProvider> themeProvider(SharedPreferences prefs) async {
    final provider = ThemeProvider();
    await provider.initialize();
    return provider;
  }
}