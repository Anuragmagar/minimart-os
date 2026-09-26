import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'di/injection.dart';
import 'theme/theme_provider.dart';

class PosApp extends StatelessWidget {
  const PosApp({super.key, this.themeProvider});

  final ThemeProvider? themeProvider;

  @override
  Widget build(BuildContext context) {
    final provider = themeProvider ?? Provider.of<ThemeProvider>(context, listen: false);
    return ChangeNotifierProvider.value(
      value: provider,
      child: Consumer<ThemeProvider>(
        builder: (context, themeProvider, child) {
          return MaterialApp.router(
            title: 'MiniMart OS',
            theme: themeProvider.lightTheme,
            darkTheme: themeProvider.darkTheme,
            themeMode: ThemeMode.system,
            routerConfig: getIt<GoRouter>(),
          );
        },
      ),
    );
  }
}
