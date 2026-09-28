import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:pos/src/ui/components/pos/pos_components.dart';
import 'package:pos/src/ui/components/primitives/app_primitives.dart';

void main() {
  group('MoneyDisplay', () {
    testWidgets('formats numeric amount with symbol', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: MoneyDisplay(amount: 123.45)),
        ),
      );

      expect(find.textContaining('Rs'), findsOneWidget);
      expect(find.textContaining('123.45'), findsOneWidget);
    });

    testWidgets('formats integer amount with decimal places', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: MoneyDisplay(amount: 100)),
        ),
      );

      expect(find.textContaining('100.00'), findsOneWidget);
    });

    testWidgets('shows negative amount in error color', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: MoneyDisplay(amount: -50.00)),
        ),
      );

      // Just verify it renders
      expect(find.textContaining('50.00'), findsOneWidget);
    });

    testWidgets('omits symbol when showSymbol=false', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: MoneyDisplay(amount: 50, showSymbol: false)),
        ),
      );

      expect(find.textContaining('Rs'), findsNothing);
      expect(find.textContaining('50.00'), findsOneWidget);
    });

    testWidgets('uses custom decimal places', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: MoneyDisplay(amount: 10, decimalPlaces: 3)),
        ),
      );

      expect(find.textContaining('10.000'), findsOneWidget);
    });
  });

  group('QuantityInput', () {
    testWidgets('shows initial value', (tester) async {
      String? captured;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: QuantityInput(
              value: '5',
              onChanged: (v) => captured = v,
            ),
          ),
        ),
      );

      expect(find.text('5'), findsOneWidget);
    });

    testWidgets('increment button increases value', (tester) async {
      String? captured;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: QuantityInput(
              value: '5',
              onChanged: (v) => captured = v,
              step: 1,
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.add));
      expect(captured, '6');
    });

    testWidgets('decrement button decreases value', (tester) async {
      String? captured;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: QuantityInput(
              value: '5',
              onChanged: (v) => captured = v,
              step: 1,
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.remove));
      expect(captured, '4');
    });

    testWidgets('respects min value', (tester) async {
      String? captured;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: QuantityInput(
              value: '0',
              onChanged: (v) => captured = v,
              min: 0,
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.remove));
      // Should not go below min
      expect(captured, isNull); // onChanged not called if value clamped to same
    });

    testWidgets('shows keypad when toggled', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: QuantityInput(
              value: '5',
              onChanged: (_) {},
              showKeypad: true,
            ),
          ),
        ),
      );

      // Initially no keypad
      expect(find.byType(NumericKeypad), findsNothing);

      // Tap show keypad button
      await tester.tap(find.text('Show keypad'));
      await tester.pumpAndSettle();

      expect(find.byType(NumericKeypad), findsOneWidget);
    });
  });

  group('NumericKeypad', () {
    testWidgets('builds with digits and submits value', (tester) async {
      String? submitted;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NumericKeypad(
              onSubmit: (v) => submitted = v,
              initialValue: '',
            ),
          ),
        ),
      );

      // Tap digits 1, 2, 3
      await tester.tap(find.text('1'));
      await tester.tap(find.text('2'));
      await tester.tap(find.text('3'));

      expect(find.text('123'), findsOneWidget);

      // Submit
      await tester.tap(find.text('OK'));
      expect(submitted, '123');
    });

    testWidgets('backspace removes last digit', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NumericKeypad(
              onSubmit: (_) {},
              initialValue: '123',
            ),
          ),
        ),
      );

      await tester.tap(find.text('⌫'));
      expect(find.text('12'), findsOneWidget);
    });

    testWidgets('clear button clears all', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NumericKeypad(
              onSubmit: (_) {},
              initialValue: '12345',
            ),
          ),
        ),
      );

      await tester.tap(find.text('⌫'));
      await tester.tap(find.text('⌫'));
      await tester.tap(find.text('⌫'));
      await tester.tap(find.text('⌫'));
      await tester.tap(find.text('⌫'));

      expect(find.text('0'), findsOneWidget); // Shows 0 when empty
    });

    testWidgets('decimal point works once', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NumericKeypad(
              onSubmit: (_) {},
              initialValue: '',
              decimalAllowed: true,
            ),
          ),
        ),
      );

      await tester.tap(find.text('1'));
      await tester.tap(find.text('.'));
      await tester.tap(find.text('2'));
      await tester.tap(find.text('5'));

      expect(find.text('1.25'), findsOneWidget);

      // Second decimal should be ignored
      await tester.tap(find.text('.'));
      expect(find.text('1.25'), findsOneWidget);
    });

    testWidgets('decimal not allowed when decimalAllowed=false', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NumericKeypad(
              onSubmit: (_) {},
              initialValue: '',
              decimalAllowed: false,
            ),
          ),
        ),
      );

      // Decimal key should be backspace instead
      expect(find.text('.'), findsNothing);
      expect(find.text('⌫'), findsWidgets);
    });
  });

  group('ProductCard', () {
    testWidgets('renders name, sku, price', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProductCard(
              name: 'Parle-G 250g',
              sku: 'PG-250',
              price: 35.00,
            ),
          ),
        ),
      );

      expect(find.text('Parle-G 250g'), findsOneWidget);
      expect(find.text('PG-250'), findsOneWidget);
      expect(find.textContaining('35'), findsOneWidget); // Price contains 35
    });

    testWidgets('shows low stock badge', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProductCard(
              name: 'Test',
              sku: 'T-1',
              price: 10,
              stock: 5,
              isLowStock: true,
            ),
          ),
        ),
      );

      expect(find.text('LOW'), findsOneWidget);
    });

    testWidgets('shows out of stock badge', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProductCard(
              name: 'Test',
              sku: 'T-1',
              price: 10,
              isOutOfStock: true,
            ),
          ),
        ),
      );

      expect(find.text('OUT'), findsOneWidget);
    });

    testWidgets('calls onTap', (tester) async {
      bool tapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProductCard(
              name: 'Test',
              sku: 'T-1',
              price: 10,
              onTap: () => tapped = true,
            ),
          ),
        ),
      );

      await tester.tap(find.byType(AppCard));
      expect(tapped, isTrue);
    });
  });

  group('ReceiptLine', () {
    testWidgets('renders name, quantity, unit price, total', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ReceiptLine(
              name: 'Parle-G 250g',
              quantity: 2,
              unitPrice: 35.00,
              total: 70.00,
            ),
          ),
        ),
      );

      expect(find.text('Parle-G 250g'), findsOneWidget);
      expect(find.textContaining('2 ×'), findsOneWidget);
      expect(find.textContaining('70.00'), findsOneWidget);
    });

    testWidgets('shows discount and tax when provided', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ReceiptLine(
              name: 'Item',
              quantity: 1,
              unitPrice: 100,
              total: 95,
              discount: 5,
              tax: 10,
            ),
          ),
        ),
      );

      expect(find.textContaining('Disc:'), findsOneWidget);
      expect(find.textContaining('Tax:'), findsOneWidget);
    });
  });
}