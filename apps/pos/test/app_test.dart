import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:pos/src/app.dart';
import 'package:pos/src/di/injection.dart';

void main() {
  setUp(() {
    GetIt.instance.reset();
    configureDependencies();
  });
  tearDown(() => GetIt.instance.reset());

  testWidgets('app boots and renders home page', (WidgetTester tester) async {
    await tester.pumpWidget(const PosApp());
    await tester.pumpAndSettle();

    expect(find.text('MiniMart OS'), findsOneWidget);
    expect(find.text('POS ready'), findsOneWidget);
  });
}
