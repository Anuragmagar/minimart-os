import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pos/src/di/injection.dart';

class MockSharedPreferences extends Mock implements SharedPreferences {}

void main() {
  setUp(() => GetIt.instance.reset());
  tearDown(() => GetIt.instance.reset());

  test('DI container registers GoRouter as singleton', () {
    final mockPrefs = MockSharedPreferences();
    when(() => mockPrefs.getString(any())).thenReturn(null);
    when(() => mockPrefs.setString(any(), any())).thenAnswer((_) async => true);

    configureDependencies(sharedPreferencesOverride: mockPrefs);

    final first = getIt<GoRouter>();
    final second = getIt<GoRouter>();

    expect(first, isA<GoRouter>());
    expect(identical(first, second), isTrue);
  });
}
