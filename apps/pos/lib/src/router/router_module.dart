import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:injectable/injectable.dart';

import '../auth/auth_state.dart';
import '../auth/login_page.dart';
import '../features/home/home_page.dart';
import '../shell/app_shell.dart';

@module
abstract class RouterModule {
  @singleton
  GoRouter appRouter(AuthState authState) => GoRouter(
    initialLocation: '/pos',
    refreshListenable: authState,
    redirect: (context, state) => _redirect(authState, state),
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/pos', builder: (context, state) => const HomePage()),
          GoRoute(
            path: '/products',
            builder: (context, state) =>
                const PlaceholderPage(title: 'Products'),
          ),
          GoRoute(
            path: '/sales',
            builder: (context, state) => const PlaceholderPage(title: 'Sales'),
          ),
          GoRoute(
            path: '/customers',
            builder: (context, state) =>
                const PlaceholderPage(title: 'Customers'),
          ),
          GoRoute(
            path: '/returns',
            builder: (context, state) =>
                const PlaceholderPage(title: 'Returns'),
          ),
          GoRoute(
            path: '/purchases',
            builder: (context, state) =>
                const PlaceholderPage(title: 'Purchases'),
          ),
          GoRoute(
            path: '/inventory',
            builder: (context, state) =>
                const PlaceholderPage(title: 'Inventory'),
          ),
          GoRoute(
            path: '/reports',
            builder: (context, state) =>
                const PlaceholderPage(title: 'Reports'),
          ),
          GoRoute(
            path: '/settings',
            builder: (context, state) =>
                const PlaceholderPage(title: 'Settings'),
          ),
        ],
      ),
    ],
  );
}

String? _redirect(AuthState authState, GoRouterState state) {
  final isLoggedIn = authState.isAuthenticated;
  final isLoggingIn = state.matchedLocation == '/login';
  final isUnknown = authState.isUnknown;

  if (isUnknown) {
    return null;
  }

  if (!isLoggedIn && !isLoggingIn) {
    return '/login';
  }

  if (isLoggedIn && isLoggingIn) {
    return '/pos';
  }

  return null;
}

class PlaceholderPage extends StatelessWidget {
  const PlaceholderPage({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title - Coming Soon')),
    );
  }
}
