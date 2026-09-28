import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/di/injection.dart';

import 'setup.dart';

class MockSharedPreferences extends Mock implements SharedPreferences {}

void main() {
  setUpAll(configureTestDrift);

  tearDown(() async {
    // Close the database before dropping the container, otherwise each test
    // leaks an open AppDatabase and Drift warns about concurrent instances.
    if (GetIt.instance.isRegistered<AppDatabase>()) {
      await GetIt.instance<AppDatabase>().close();
    }
    await GetIt.instance.reset();
  });

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('DI container registers GoRouter as singleton', () {
    final mockPrefs = MockSharedPreferences();
    when(() => mockPrefs.getString(any())).thenReturn(null);
    when(() => mockPrefs.setString(any(), any())).thenAnswer((_) async => true);

    configureDependencies(
      sharedPreferencesOverride: mockPrefs,
      databaseExecutorOverride: NativeDatabase.memory(),
    );

    final first = getIt<GoRouter>();
    final second = getIt<GoRouter>();

    expect(first, isA<GoRouter>());
    expect(identical(first, second), isTrue);
  });
}
