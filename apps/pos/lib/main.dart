import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:window_manager/window_manager.dart';

import 'src/app.dart';
import 'src/auth/auth_state.dart';
import 'src/di/injection.dart';
import 'src/theme/theme_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  WindowOptions windowOptions = const WindowOptions(
    minimumSize: Size(1200, 800),
    center: true,
    backgroundColor: Colors.transparent,
    skipTaskbar: false,
    titleBarStyle: TitleBarStyle.normal,
  );
  windowManager.waitUntilReadyToShow(windowOptions, () async {
    await windowManager.show();
    await windowManager.focus();
  });

  final prefs = await SharedPreferences.getInstance();
  configureDependencies(sharedPreferencesOverride: prefs);

  final themeProvider = await getIt.getAsync<ThemeProvider>();
  final authState = getIt.get<AuthState>();
  await authState.initialize();

  runApp(PosApp(themeProvider: themeProvider));
}
