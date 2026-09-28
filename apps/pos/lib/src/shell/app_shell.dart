import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_state.dart';
import '../di/injection.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  static const List<NavigationDestination> _destinations = [
    NavigationDestination(
      icon: Icon(Icons.point_of_sale_outlined),
      selectedIcon: Icon(Icons.point_of_sale),
      label: 'POS',
    ),
    NavigationDestination(
      icon: Icon(Icons.inventory_2_outlined),
      selectedIcon: Icon(Icons.inventory_2),
      label: 'Products',
    ),
    NavigationDestination(
      icon: Icon(Icons.shopping_cart_outlined),
      selectedIcon: Icon(Icons.shopping_cart),
      label: 'Sales',
    ),
    NavigationDestination(
      icon: Icon(Icons.people_outline),
      selectedIcon: Icon(Icons.people),
      label: 'Customers',
    ),
    NavigationDestination(
      icon: Icon(Icons.receipt_long_outlined),
      selectedIcon: Icon(Icons.receipt_long),
      label: 'Returns',
    ),
    NavigationDestination(
      icon: Icon(Icons.local_shipping_outlined),
      selectedIcon: Icon(Icons.local_shipping),
      label: 'Purchases',
    ),
    NavigationDestination(
      icon: Icon(Icons.inventory_outlined),
      selectedIcon: Icon(Icons.inventory),
      label: 'Inventory',
    ),
    NavigationDestination(
      icon: Icon(Icons.assessment_outlined),
      selectedIcon: Icon(Icons.assessment),
      label: 'Reports',
    ),
    NavigationDestination(
      icon: Icon(Icons.settings_outlined),
      selectedIcon: Icon(Icons.settings),
      label: 'Settings',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _selectedIndex,
            onDestinationSelected: (index) {
              setState(() => _selectedIndex = index);
              _navigateToDestination(index);
            },
            labelType: MediaQuery.of(context).size.width > 1000
                ? NavigationRailLabelType.none
                : NavigationRailLabelType.all,
            destinations: _destinations
                .map(
                  (d) => NavigationRailDestination(
                    icon: d.icon,
                    selectedIcon: d.selectedIcon,
                    label: Text(d.label),
                  ),
                )
                .toList(),
            extended: MediaQuery.of(context).size.width > 1000,
            minExtendedWidth: 200,
          ),
          VerticalDivider(thickness: 1, width: 1),
          Expanded(
            child: Column(
              children: [
                _AppHeader(),
                Expanded(child: widget.child),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _navigateToDestination(int index) {
    const routes = [
      '/pos',
      '/products',
      '/sales',
      '/customers',
      '/returns',
      '/purchases',
      '/inventory',
      '/reports',
      '/settings',
    ];
    if (index < routes.length) {
      getIt<GoRouter>().go(routes[index]);
    }
  }
}

class _AppHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).colorScheme.outlineVariant,
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'MiniMart OS',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          const SizedBox(width: 16),
          _UserMenu(),
        ],
      ),
    );
  }
}

class _UserMenu extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      icon: CircleAvatar(
        child: Text(
          'AD',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: Theme.of(context).colorScheme.onPrimary,
              ),
        ),
      ),
      itemBuilder: (context) => [
        const PopupMenuItem(
          value: 'profile',
          child: ListTile(
            leading: Icon(Icons.person_outline),
            title: Text('Profile'),
            contentPadding: EdgeInsets.zero,
          ),
        ),
        const PopupMenuItem(
          value: 'logout',
          child: ListTile(
            leading: Icon(Icons.logout),
            title: Text('Logout'),
            contentPadding: EdgeInsets.zero,
          ),
        ),
      ],
      onSelected: (value) async {
        if (value == 'logout') {
          final authState = getIt<AuthState>();
          await authState.logout();
          if (context.mounted) {
            context.go('/login');
          }
        }
      },
    );
  }
}