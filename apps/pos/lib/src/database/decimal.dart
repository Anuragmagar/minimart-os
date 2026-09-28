import 'package:drift/drift.dart';

/// Exact fixed-point decimal backed by an integer, used for money and
/// quantity columns.
///
/// `AGENTS.md` §12 requires NUMERIC for money and quantity and forbids
/// floating point; `brain/ARCHITECTURE.md` §Database repeats this. SQLite has
/// no native decimal type and IEEE-754 doubles cannot represent values like
/// 0.1 exactly, which would corrupt weighted-average costing (BR-018) and make
/// the inventory invariant `opening + inbound - outbound = closing` (BR-005)
/// drift over many lines.
///
/// Values are stored as an integer count of minor units (for example paisa for
/// 2dp money, milli-units for 3dp quantity) so arithmetic stays exact and the
/// server remains authoritative for final rounding.
class Decimal {
  /// Number of digits after the decimal point.
  final int scale;

  /// The value expressed in minor units. 1234 at scale 2 is `12.34`.
  final int unscaled;

  const Decimal(this.unscaled, {this.scale = 2});

  static const Decimal zero = Decimal(0);

  /// Builds a decimal from a whole number of major units.
  factory Decimal.fromInt(int value, {int scale = 2}) =>
      Decimal(value * _pow10(scale), scale: scale);

  /// Parses a decimal literal such as `"12.34"`, rejecting malformed input.
  factory Decimal.parse(String input, {int scale = 2}) {
    final match = RegExp(r'^(-)?(\d+)(?:\.(\d+))?$').firstMatch(input.trim());
    if (match == null) {
      throw FormatException('Not a decimal value', input);
    }
    final negative = match.group(1) == '-';
    final whole = int.parse(match.group(2)!);
    final fractionText = match.group(3) ?? '';
    if (fractionText.length > scale) {
      throw FormatException('More than $scale decimal places', input);
    }
    final padded = fractionText.padRight(scale, '0');
    final unscaled = whole * _pow10(scale) +
        (padded.isEmpty ? 0 : int.parse(padded));
    return Decimal(negative ? -unscaled : unscaled, scale: scale);
  }

  Decimal operator +(Decimal other) {
    _assertSameScale(other);
    return Decimal(unscaled + other.unscaled, scale: scale);
  }

  Decimal operator -(Decimal other) {
    _assertSameScale(other);
    return Decimal(unscaled - other.unscaled, scale: scale);
  }

  /// Multiplication, rescaled to this value's scale.
  ///
  /// `a / 10^s1 * b / 10^s2` equals `a * b / 10^(s1 + s2)`, so the raw integer
  /// product sits at scale `s1 + s2` and is rescaled down to this value's scale.
  Decimal operator *(Decimal other) => Decimal(
        _rescale(unscaled * other.unscaled, scale + other.scale, scale),
        scale: scale,
      );

  bool operator >(Decimal other) {
    _assertSameScale(other);
    return unscaled > other.unscaled;
  }

  bool operator >=(Decimal other) {
    _assertSameScale(other);
    return unscaled >= other.unscaled;
  }

  bool operator <(Decimal other) {
    _assertSameScale(other);
    return unscaled < other.unscaled;
  }

  bool operator <=(Decimal other) {
    _assertSameScale(other);
    return unscaled <= other.unscaled;
  }

  bool get isNegative => unscaled < 0;

  bool get isZero => unscaled == 0;

  Decimal abs() => isNegative ? Decimal(-unscaled, scale: scale) : this;

  /// Converts to a double. Intended for display and for JSON payloads only;
  /// never use it for arithmetic or stored values.
  double toDouble() => unscaled / _pow10(scale);

  static int _pow10(int exponent) {
    var result = 1;
    for (var i = 0; i < exponent; i++) {
      result *= 10;
    }
    return result;
  }

  /// Rescales an integer value expressed at [fromScale] to [toScale].
  ///
  /// Downscaling rounds half away from zero rather than truncating, so repeated
  /// weighted-average rounding does not systematically lose value. The server
  /// remains authoritative for final rounding.
  static int _rescale(int value, int fromScale, int toScale) {
    if (fromScale == toScale) return value;
    if (fromScale < toScale) {
      return value * _pow10(toScale - fromScale);
    }
    final divisor = _pow10(fromScale - toScale);
    final quotient = value ~/ divisor;
    final remainder = (value % divisor).abs();
    final roundAwayFromZero = remainder * 2 >= divisor;
    final magnitude = quotient.abs() + (roundAwayFromZero ? 1 : 0);
    return value.isNegative ? -magnitude : magnitude;
  }

  void _assertSameScale(Decimal other) {
    if (other.scale != scale) {
      throw ArgumentError(
        'Decimal scale mismatch: $scale vs ${other.scale}. '
        'Rescale explicitly before mixing values.',
      );
    }
  }

  @override
  bool operator ==(Object other) =>
      other is Decimal && other.unscaled == unscaled && other.scale == scale;

  @override
  int get hashCode => Object.hash(unscaled, scale);

  @override
  String toString() => '${unscaled ~/ _pow10(scale)}.'
      '${(unscaled.abs() % _pow10(scale)).toString().padLeft(scale, '0')}';
}

/// Converts [Decimal] to and from its integer minor-unit representation.
class DecimalConverter extends TypeConverter<Decimal, int> {
  final int scale;

  const DecimalConverter(this.scale);

  @override
  Decimal fromSql(int fromDb) => Decimal(fromDb, scale: scale);

  @override
  int toSql(Decimal value) {
    if (value.scale != scale) {
      throw ArgumentError('Expected scale $scale but got ${value.scale}');
    }
    return value.unscaled;
  }
}

/// Two decimal places, matching the backend `Decimal(14, 2)` used for money.
const decimal2 = DecimalConverter(2);

/// Three decimal places, matching the backend `Decimal(14, 3)` used for quantity.
const decimal3 = DecimalConverter(3);

/// Four decimal places, matching the backend `Decimal(14, 4)` used for tax rates.
const decimal4 = DecimalConverter(4);

/// Six decimal places, matching the backend `Decimal(14, 6)` used for unit
/// conversion multipliers.
const decimal6 = DecimalConverter(6);

/// Convenience constructors for the scales used by the schema.
Decimal money(int unscaled) => Decimal(unscaled, scale: 2);

Decimal quantity(int unscaled) => Decimal(unscaled, scale: 3);
