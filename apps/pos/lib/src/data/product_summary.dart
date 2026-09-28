import 'package:pos/src/database/decimal.dart';

/// Domain view of a sellable product.
///
/// Deliberately a plain immutable value rather than a Drift row, so the
/// storage schema can change without rippling into presentation and so
/// `Decimal` cannot silently become `double` on the way up.
class ProductSummary {
  final String id;
  final String organizationId;
  final String sku;
  final String name;
  final String? categoryId;
  final String? brandId;
  final String? unitId;
  final String? taxCategoryId;
  final Decimal? defaultPurchasePrice;
  final Decimal? defaultSellingPrice;
  final Decimal? reorderLevel;
  final String status;

  const ProductSummary({
    required this.id,
    required this.organizationId,
    required this.sku,
    required this.name,
    required this.status,
    this.categoryId,
    this.brandId,
    this.unitId,
    this.taxCategoryId,
    this.defaultPurchasePrice,
    this.defaultSellingPrice,
    this.reorderLevel,
  });

  /// True when the product is not deactivated.
  ///
  /// This mirrors the `active` / `inactive` status values on the server
  /// (`ProductStatus` in the Prisma schema); it is a field read, not an
  /// invented rule about what may be sold.
  bool get isActive => status == 'active';

  @override
  bool operator ==(Object other) =>
      other is ProductSummary &&
      other.id == id &&
      other.organizationId == organizationId &&
      other.sku == sku &&
      other.name == name &&
      other.categoryId == categoryId &&
      other.brandId == brandId &&
      other.unitId == unitId &&
      other.taxCategoryId == taxCategoryId &&
      other.defaultPurchasePrice == defaultPurchasePrice &&
      other.defaultSellingPrice == defaultSellingPrice &&
      other.reorderLevel == reorderLevel &&
      other.status == status;

  @override
  int get hashCode => Object.hash(
    id,
    organizationId,
    sku,
    name,
    categoryId,
    brandId,
    unitId,
    taxCategoryId,
    defaultPurchasePrice,
    defaultSellingPrice,
    reorderLevel,
    status,
  );

  @override
  String toString() => 'ProductSummary(id: $id, sku: $sku, name: $name)';
}
