import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:injectable/injectable.dart';

import '../features/home/home_page.dart';
import '../shell/app_shell.dart';

@module
abstract class RouterModule {
  @singleton
  GoRouter appRouter() => GoRouter(
        initialLocation: '/pos',
        routes: [
          ShellRoute(
            builder: (context, state, child) => AppShell(child: child),
            routes: [
              GoRoute(
                path: '/pos',
                builder: (context, state) => const HomePage(),
              ),
              GoRoute(
                path: '/products',
                builder: (context, state) => const PlaceholderPage(title: 'Products'),
              ),
              GoRoute(
                path: '/sales',
                builder: (context, state) => const PlaceholderPage(title: 'Sales'),
              ),
              GoRoute(
                path: '/customers',
                builder: (context, state) => const PlaceholderPage(title: 'Customers'),
              ),
              GoRoute(
                path: '/returns',
                builder: (context, state) => const PlaceholderPage(title: 'Returns'),
              ),
              GoRoute(
                path: '/purchases',
                builder: (context, state) => const PlaceholderPage(title: 'Purchases'),
              ),
              GoRoute(
                path: '/inventory',
                builder: (context, state) => const PlaceholderPage(title: 'Inventory'),
              ),
              GoRoute(
                path: '/reports',
                builder: (context, state) => const PlaceholderPage(title: 'Reports'),
              ),
              GoRoute(
                path: '/settings',
                builder: (context, state) => const PlaceholderPage(title: 'Settings'),
              ),
            ],
          ),
        ],
      );
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
