import 'package:go_router/go_router.dart';
import 'package:injectable/injectable.dart';

import '../features/home/home_page.dart';

@module
abstract class RouterModule {
  @singleton
  GoRouter appRouter() => GoRouter(
    initialLocation: '/',
    routes: [GoRoute(path: '/', builder: (context, state) => const HomePage())],
  );
}
