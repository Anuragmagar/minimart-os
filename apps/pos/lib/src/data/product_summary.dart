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

  /// Carried locally from 05.09. Previously dropped by the data source, so a
  /// server refresh silently cleared it on every device.
  final String? description;

  final String? categoryId;
  final String? brandId;
  final String? unitId;
  final String? taxCategoryId;
  final Decimal? defaultPurchasePrice;
  final Decimal? defaultSellingPrice;
  final Decimal? reorderLevel;

  /// Carried locally from 05.09. Previously dropped by the data source, so a
  /// server refresh silently cleared it on every device.
  final Decimal? reorderQuantity;

  final String status;

  /// Server timestamps, carried so a device mirror keeps the server's history
  /// rather than stamping its own clock on every refresh. Optional because a
  /// locally constructed summary (tests, fixtures) has no server row behind it.
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const ProductSummary({
    required this.id,
    required this.organizationId,
    required this.sku,
    required this.name,
    required this.status,
    this.description,
    this.categoryId,
    this.brandId,
    this.unitId,
    this.taxCategoryId,
    this.defaultPurchasePrice,
    this.defaultSellingPrice,
    this.reorderLevel,
    this.reorderQuantity,
    this.createdAt,
    this.updatedAt,
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
      other.description == description &&
      other.categoryId == categoryId &&
      other.brandId == brandId &&
      other.unitId == unitId &&
      other.taxCategoryId == taxCategoryId &&
      other.defaultPurchasePrice == defaultPurchasePrice &&
      other.defaultSellingPrice == defaultSellingPrice &&
      other.reorderLevel == reorderLevel &&
      other.reorderQuantity == reorderQuantity &&
      other.status == status &&
      other.createdAt == createdAt &&
      other.updatedAt == updatedAt;

  @override
  int get hashCode => Object.hash(
    id,
    organizationId,
    sku,
    name,
    description,
    categoryId,
    brandId,
    unitId,
    taxCategoryId,
    defaultPurchasePrice,
    defaultSellingPrice,
    reorderLevel,
    reorderQuantity,
    status,
    createdAt,
    updatedAt,
  );

  @override
  String toString() => 'ProductSummary(id: $id, sku: $sku, name: $name)';
}
