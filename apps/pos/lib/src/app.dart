import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'di/injection.dart';

class PosApp extends StatelessWidget {
  const PosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'MiniMart OS',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
      routerConfig: getIt<GoRouter>(),
    );
  }
}
