import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:provider/provider.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pos/src/app.dart';
import 'package:pos/src/auth/auth_state.dart';
import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/di/injection.dart';
import 'package:pos/src/theme/theme_provider.dart';

import 'setup.dart';

class MockSharedPreferences extends Mock implements SharedPreferences {}

void main() {
  setUpAll(configureTestDrift);

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(() async {
    // Close the database before dropping the container, otherwise each test
    // leaks an open AppDatabase and Drift warns about concurrent instances.
    if (GetIt.instance.isRegistered<AppDatabase>()) {
      await GetIt.instance<AppDatabase>().close();
    }
    await GetIt.instance.reset();
  });

  testWidgets('app boots and renders home page when authenticated', (
    WidgetTester tester,
  ) async {
    final mockPrefs = MockSharedPreferences();
    when(() => mockPrefs.getString(any())).thenReturn(null);
    when(() => mockPrefs.setString(any(), any())).thenAnswer((_) async => true);

    configureDependencies(
      sharedPreferencesOverride: mockPrefs,
      databaseExecutorOverride: NativeDatabase.memory(),
    );

    final themeProvider = ThemeProvider();
    await themeProvider.initialize();

    final authState = getIt<AuthState>();
    authState.setAuthenticated('mock-access-token', 'mock-refresh-token');

    await tester.pumpWidget(
      ChangeNotifierProvider<ThemeProvider>.value(
        value: themeProvider,
        child: const PosApp(),
      ),
    );
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('MiniMart OS'), findsOneWidget);
    expect(find.text('POS ready'), findsOneWidget);
  });

  testWidgets('app redirects to login when unauthenticated', (
    WidgetTester tester,
  ) async {
    final mockPrefs = MockSharedPreferences();
    when(() => mockPrefs.getString(any())).thenReturn(null);
    when(() => mockPrefs.setString(any(), any())).thenAnswer((_) async => true);

    configureDependencies(
      sharedPreferencesOverride: mockPrefs,
      databaseExecutorOverride: NativeDatabase.memory(),
    );

    final themeProvider = ThemeProvider();
    await themeProvider.initialize();

    final authState = getIt<AuthState>();
    authState.setUnauthenticated();

    await tester.pumpWidget(
      ChangeNotifierProvider<ThemeProvider>.value(
        value: themeProvider,
        child: const PosApp(),
      ),
    );
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('MiniMart OS'), findsOneWidget);
    expect(find.text('Sign in to continue'), findsOneWidget);
  });
}
