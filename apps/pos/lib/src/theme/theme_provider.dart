import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'light_theme.dart';
import 'dark_theme.dart';

enum ThemeModeType {
  system,
  light,
  dark,
}

class ThemeProvider extends ChangeNotifier {
  static const String _themeModeKey = 'theme_mode';

  ThemeModeType _themeMode = ThemeModeType.system;
  final ThemeData _lightTheme = createLightTheme();
  final ThemeData _darkTheme = createDarkTheme();

  ThemeModeType get themeMode => _themeMode;
  ThemeData get lightTheme => _lightTheme;
  ThemeData get darkTheme => _darkTheme;

  ThemeData get currentTheme {
    switch (_themeMode) {
      case ThemeModeType.light:
        return _lightTheme;
      case ThemeModeType.dark:
        return _darkTheme;
      case ThemeModeType.system:
        // Default to light for now; system detection can be added later
        return _lightTheme;
    }
  }

  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    final savedMode = prefs.getString(_themeModeKey);
    if (savedMode != null) {
      _themeMode = ThemeModeType.values.firstWhere(
        (e) => e.name == savedMode,
        orElse: () => ThemeModeType.system,
      );
    }
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeModeType mode) async {
    if (_themeMode == mode) return;

    _themeMode = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeModeKey, mode.name);
    notifyListeners();
  }

  void toggleTheme() {
    switch (_themeMode) {
      case ThemeModeType.light:
        setThemeMode(ThemeModeType.dark);
        break;
      case ThemeModeType.dark:
        setThemeMode(ThemeModeType.system);
        break;
      case ThemeModeType.system:
        setThemeMode(ThemeModeType.light);
        break;
    }
  }
}