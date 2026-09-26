import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:provider/provider.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pos/src/app.dart';
import 'package:pos/src/di/injection.dart';
import 'package:pos/src/theme/theme_provider.dart';

class MockSharedPreferences extends Mock implements SharedPreferences {}

void main() {
  setUp(() {
    GetIt.instance.reset();
  });
  tearDown(() => GetIt.instance.reset());

  testWidgets('app boots and renders home page', (WidgetTester tester) async {
    final mockPrefs = MockSharedPreferences();
    when(() => mockPrefs.getString(any())).thenReturn(null);
    when(() => mockPrefs.setString(any(), any())).thenAnswer((_) async => true);

    configureDependencies(sharedPreferencesOverride: mockPrefs);

    final themeProvider = ThemeProvider();
    await themeProvider.initialize();

    await tester.pumpWidget(
      Provider<ThemeProvider>.value(
        value: themeProvider,
        child: const PosApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('MiniMart OS'), findsOneWidget);
    expect(find.text('POS ready'), findsOneWidget);
  });
}
