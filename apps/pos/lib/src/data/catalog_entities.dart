import 'package:pos/src/database/decimal.dart';

/// Domain view of a category node.
///
/// Mirrors the backend `Category` model, including the optional `parentId`
/// that makes the catalog a tree rather than a flat list (05.01).
class CategorySummary {
  final String id;
  final String organizationId;
  final String? parentId;
  final String name;
  final String status;

  const CategorySummary({
    required this.id,
    required this.organizationId,
    required this.name,
    required this.status,
    this.parentId,
  });

  /// True when the category is not deactivated.
  ///
  /// A field read mirroring the backend `CategoryStatus` values, not an
  /// invented rule about what may be sold.
  bool get isActive => status == 'active';

  /// True when this node sits at the root of the tree.
  bool get isRoot => parentId == null;

  @override
  bool operator ==(Object other) =>
      other is CategorySummary &&
      other.id == id &&
      other.organizationId == organizationId &&
      other.parentId == parentId &&
      other.name == name &&
      other.status == status;

  @override
  int get hashCode => Object.hash(id, organizationId, parentId, name, status);

  @override
  String toString() =>
      'CategorySummary(id: $id, name: $name, parentId: $parentId)';
}

/// Domain view of a brand.
class BrandSummary {
  final String id;
  final String organizationId;
  final String name;
  final String status;

  const BrandSummary({
    required this.id,
    required this.organizationId,
    required this.name,
    required this.status,
  });

  bool get isActive => status == 'active';

  @override
  bool operator ==(Object other) =>
      other is BrandSummary &&
      other.id == id &&
      other.organizationId == organizationId &&
      other.name == name &&
      other.status == status;

  @override
  int get hashCode => Object.hash(id, organizationId, name, status);

  @override
  String toString() => 'BrandSummary(id: $id, name: $name)';
}

/// Domain view of a unit of measure.
///
/// [precision] is the number of decimal places a quantity in this unit may
/// carry. The backend validates it as an integer 0-3 (ASM-049) and derives it
/// from the `NUMERIC(14,3)` quantity column rather than from a documented
/// business rule.
class UnitSummary {
  final String id;
  final String organizationId;
  final String code;
  final String name;
  final int precision;
  final String status;

  const UnitSummary({
    required this.id,
    required this.organizationId,
    required this.code,
    required this.name,
    required this.precision,
    required this.status,
  });

  bool get isActive => status == 'active';

  @override
  bool operator ==(Object other) =>
      other is UnitSummary &&
      other.id == id &&
      other.organizationId == organizationId &&
      other.code == code &&
      other.name == name &&
      other.precision == precision &&
      other.status == status;

  @override
  int get hashCode =>
      Object.hash(id, organizationId, code, name, precision, status);

  @override
  String toString() => 'UnitSummary(id: $id, code: $code, name: $name)';
}

/// Domain view of a directed unit conversion.
///
/// [multiplier] means how many [toUnit] make up one [fromUnit], so the seeded
/// `DOZ -> PCS 12` row is stored as multiplier 12 (ASM-050). Reciprocals are
/// explicit rows and are never derived, so `PCS -> DOZ 0.083333` is stored
/// exactly as entered rather than recomputed as `1/12`.
class UnitConversionSummary {
  final String id;
  final String organizationId;
  final String fromUnitId;
  final String toUnitId;
  final Decimal multiplier;
  final DateTime createdAt;
  final DateTime updatedAt;

  const UnitConversionSummary({
    required this.id,
    required this.organizationId,
    required this.fromUnitId,
    required this.toUnitId,
    required this.multiplier,
    required this.createdAt,
    required this.updatedAt,
  });

  @override
  bool operator ==(Object other) =>
      other is UnitConversionSummary &&
      other.id == id &&
      other.organizationId == organizationId &&
      other.fromUnitId == fromUnitId &&
      other.toUnitId == toUnitId &&
      other.multiplier == multiplier;

  @override
  int get hashCode =>
      Object.hash(id, organizationId, fromUnitId, toUnitId, multiplier);

  @override
  String toString() =>
      'UnitConversionSummary($fromUnitId -> $toUnitId x${multiplier.unscaled})';
}

/// Domain view of a tax category.
///
/// The rate is configuration, never a hardcoded constant (AGENTS.md section
/// 24). Nothing in the catalog computes tax; that belongs to 14.03.
class TaxCategorySummary {
  final String id;
  final String organizationId;
  final String code;
  final String name;
  final Decimal rate;
  final String taxType;
  final DateTime effectiveFrom;
  final DateTime? effectiveTo;
  final String status;

  const TaxCategorySummary({
    required this.id,
    required this.organizationId,
    required this.code,
    required this.name,
    required this.rate,
    required this.taxType,
    required this.effectiveFrom,
    required this.status,
    this.effectiveTo,
  });

  bool get isActive => status == 'active';

  /// True when [at] falls inside this category's effective window.
  ///
  /// Half-open `[effectiveFrom, effectiveTo)` with a null end meaning
  /// open-ended, mirroring the backend window rule exactly. The same predicate
  /// is used by tax categories (05.07) and price periods (05.08), so one
  /// implementation serves both rather than two that can drift apart.
  bool isEffectiveAt(DateTime at) {
    if (at.isBefore(effectiveFrom)) return false;
    final end = effectiveTo;
    return end == null || at.isBefore(end);
  }

  @override
  bool operator ==(Object other) =>
      other is TaxCategorySummary &&
      other.id == id &&
      other.organizationId == organizationId &&
      other.code == code &&
      other.name == name &&
      other.rate == rate &&
      other.taxType == taxType &&
      other.effectiveFrom == effectiveFrom &&
      other.effectiveTo == effectiveTo &&
      other.status == status;

  @override
  int get hashCode => Object.hash(
    id,
    organizationId,
    code,
    name,
    rate,
    taxType,
    effectiveFrom,
    effectiveTo,
    status,
  );

  @override
  String toString() => 'TaxCategorySummary(id: $id, code: $code, rate: $rate)';
}
