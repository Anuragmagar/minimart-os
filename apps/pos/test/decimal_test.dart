import 'package:flutter_test/flutter_test.dart';

import 'package:pos/src/database/decimal.dart';

void main() {
  group('Decimal construction', () {
    test('stores minor units against a scale', () {
      const money = Decimal(1234);
      expect(money.unscaled, 1234);
      expect(money.scale, 2);
      expect(money.toDouble(), 12.34);
    });

    test('handles negative values', () {
      const value = Decimal(-1250, scale: 3);
      expect(value.unscaled, -1250);
      expect(value.toDouble(), -1.25);
      expect(value.isNegative, isTrue);
      expect(value.abs(), const Decimal(1250, scale: 3));
    });

    test('zero is neither negative nor non-zero', () {
      const zero = Decimal(0, scale: 3);
      expect(zero.isZero, isTrue);
      expect(zero.isNegative, isFalse);
    });
  });

  group('exact arithmetic', () {
    test('addition is exact where float64 is not', () {
      var total = Decimal(0, scale: 2);
      for (var i = 0; i < 10; i++) {
        total = total + const Decimal(10);
      }
      expect(total, const Decimal(100));
      expect(total.toDouble(), 1.0);

      // The float64 equivalent drifts.
      var floatTotal = 0.0;
      for (var i = 0; i < 10; i++) {
        floatTotal += 0.1;
      }
      expect(floatTotal == 1.0, isFalse);
    });

    test('repeated pennies never drift', () {
      var total = Decimal(0, scale: 2);
      for (var i = 0; i < 1000; i++) {
        total = total + const Decimal(1); // one paisa
      }
      expect(total, const Decimal(1000)); // exactly 10.00
    });

    test('subtraction keeps sign', () {
      const a = Decimal(55000, scale: 3);
      const b = Decimal(12500, scale: 3);
      expect(a - b, const Decimal(42500, scale: 3)); // 55.000 - 12.500
      expect(b - a, const Decimal(-42500, scale: 3)); // 12.500 - 55.000
    });

    test('multiplication rescales to the receiver scale', () {
      // 2.50 (money) * 3.000 (quantity) = 7.500, expressed at scale 2
      final result =
          const Decimal(250, scale: 2) * const Decimal(3000, scale: 3);
      expect(result.scale, 2);
      expect(result.unscaled, 750);
      expect(result.toDouble(), 7.5);
    });

    test('downscaling rounds half away from zero', () {
      // Receiver scale 2 forces a downscale of 1.00 * 0.125 = 0.125 -> 0.13
      final up = const Decimal(100, scale: 2) * const Decimal(125, scale: 3);
      expect(up, const Decimal(13));
      expect(up.toDouble(), closeTo(0.13, 1e-9));

      final down = const Decimal(-100, scale: 2) * const Decimal(125, scale: 3);
      expect(down, const Decimal(-13));
    });

    test('result scale follows the receiver, not the operands', () {
      final asThree =
          const Decimal(125, scale: 3) * const Decimal(100, scale: 2);
      expect(asThree.scale, 3);
      expect(asThree.unscaled, 125);
    });

    test('rejects mixing scales', () {
      expect(
        () => const Decimal(1, scale: 2) + const Decimal(1, scale: 3),
        throwsA(isA<ArgumentError>()),
      );
    });
  });

  group('comparisons', () {
    test('orders by unscaled value at equal scale', () {
      const small = Decimal(100, scale: 2);
      const large = Decimal(200, scale: 2);

      expect(small < large, isTrue);
      expect(large > small, isTrue);
      expect(small <= large, isTrue);
      expect(large >= small, isTrue);
      expect(small == const Decimal(100, scale: 2), isTrue);
      expect(small == const Decimal(100, scale: 3), isFalse);
    });
  });

  group('converters', () {
    test('money converter round-trips at scale 2', () {
      const value = Decimal(123456);
      expect(decimal2.toSql(value), 123456);
      expect(decimal2.fromSql(123456), value);
    });

    test('quantity converter round-trips at scale 3', () {
      const value = Decimal(-12500, scale: 3);
      expect(decimal3.toSql(value), -12500);
      expect(decimal3.fromSql(-12500), value);
    });

    test('tax converter round-trips at scale 4', () {
      const value = Decimal(1300, scale: 4); // 0.1300 = 13%
      expect(decimal4.toSql(value), 1300);
      expect(decimal4.fromSql(1300), value);
    });

    test('converter rejects a mismatched scale', () {
      expect(
        () => decimal2.toSql(const Decimal(1, scale: 3)),
        throwsA(isA<ArgumentError>()),
      );
    });
  });

  test('toString renders the decimal point', () {
    expect(const Decimal(1234).toString(), '12.34');
    expect(const Decimal(100, scale: 2).toString(), '1.00');
    expect(const Decimal(5, scale: 3).toString(), '0.005');
    expect(const Decimal(-1250, scale: 3).toString(), '-1.250');
  });

  group('parse', () {
    test('parses plain and fractional values', () {
      expect(Decimal.parse('12.34'), const Decimal(1234));
      expect(Decimal.parse('12'), const Decimal(1200));
      expect(Decimal.parse('12.3'), const Decimal(1230));
      expect(Decimal.parse('-12.34'), const Decimal(-1234));
    });

    test('pads to the requested scale', () {
      expect(Decimal.parse('0.005', scale: 3), const Decimal(5, scale: 3));
    });

    test('rejects malformed input', () {
      expect(() => Decimal.parse('abc'), throwsA(isA<FormatException>()));
      expect(() => Decimal.parse('12.345'), throwsA(isA<FormatException>()));
      expect(() => Decimal.parse(''), throwsA(isA<FormatException>()));
    });
  });
}
