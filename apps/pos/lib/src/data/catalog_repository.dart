import 'package:pos/src/data/catalog_entities.dart';
import 'package:pos/src/data/catalog_local_data_source.dart';
import 'package:pos/src/data/price_entities.dart';
import 'package:pos/src/data/product_local_data_source.dart';
import 'package:pos/src/data/product_summary.dart';
import 'package:pos/src/data/tenant_scope.dart';
import 'package:pos/src/database/decimal.dart';

/// A product joined with the display fields the POS needs to render it.
///
/// A POS screen shows a category name, a brand name and a unit code, and
/// cannot reach the network for them while offline. Joining the parents once
/// here avoids a lookup per field at render time, and keeps the assembled
/// value a plain domain object so Drift rows never escape the data layer.
class CatalogProduct {
  final ProductSummary product;
  final CategorySummary? category;
  final BrandSummary? brand;
  final UnitSummary? unit;
  final TaxCategorySummary? taxCategory;
  final ProductBarcodeEntry? primaryBarcode;

  const CatalogProduct({
    required this.product,
    this.category,
    this.brand,
    this.unit,
    this.taxCategory,
    this.primaryBarcode,
  });

  String get id => product.id;
  String get sku => product.sku;
  String get name => product.name;
  bool get isActive => product.isActive;

  /// Label for a receipt line or search result.
  ///
  /// Prefers the product's own name. The brand and category are appended only
  /// when present, because all three parents are optional on a product and a
  /// screen must not assume any of them exist.
  String get displayName {
    final qualifiers = [
      if (brand != null) brand!.name,
      if (category != null) category!.name,
    ];
    if (qualifiers.isEmpty) return name;
    return '${qualifiers.join(' / ')} $name';
  }

  @override
  String toString() => 'CatalogProduct($sku, $displayName)';
}

/// Offline-first repository for the product catalog.
///
/// Reads are always local, because `brain/OFFLINE_SYNC.md` Local Authority
/// makes local SQLite authoritative for the current device session. Window and
/// tenant rules live on the domain values and in the data sources, so each rule
/// is stated once rather than restated per call site.
class ProductCatalogDataRepository {
  final ProductLocalDataSource _products;
  final CatalogLocalDataSource _catalog;

  const ProductCatalogDataRepository(this._products, this._catalog);

  // ----------------------------------------------------------------- catalog

  Future<List<CategorySummary>> categories(TenantScope scope) =>
      _catalog.findCategories(scope);

  Future<List<BrandSummary>> brands(TenantScope scope) =>
      _catalog.findBrands(scope);

  Future<List<UnitSummary>> units(TenantScope scope) =>
      _catalog.findUnits(scope);

  Future<List<TaxCategorySummary>> taxCategories(TenantScope scope) =>
      _catalog.findTaxCategories(scope);

  Future<List<UnitConversionSummary>> unitConversions(TenantScope scope) =>
      _catalog.findUnitConversions(scope);

  // ----------------------------------------------------------------- product

  /// A product with its catalog parents resolved.
  ///
  /// Returns null when the product is absent or belongs to another
  /// organization; the two are deliberately indistinguishable so existence is
  /// not disclosed across tenants.
  Future<CatalogProduct?> productWithParents(
    TenantScope scope,
    String productId,
  ) async {
    final product = await _products.findById(scope, productId);
    if (product == null) return null;

    // Each parent is resolved once and independently nullable: a product with
    // no category is normal, not an error.
    final category = product.categoryId == null
        ? null
        : await _catalog.findCategoryById(scope, product.categoryId!);
    final brand = product.brandId == null
        ? null
        : await _catalog.findBrandById(scope, product.brandId!);
    final unit = product.unitId == null
        ? null
        : await _catalog.findUnitById(scope, product.unitId!);
    final taxCategory = product.taxCategoryId == null
        ? null
        : await _catalog.findTaxCategoryById(scope, product.taxCategoryId!);
    final primary = await _catalog.findPrimaryBarcode(scope, product.id);

    return CatalogProduct(
      product: product,
      category: category,
      brand: brand,
      unit: unit,
      taxCategory: taxCategory,
      primaryBarcode: primary,
    );
  }

  /// Every product in [scope] with its catalog parents resolved.
  ///
  /// The parents are read once each and matched in memory rather than issued
  /// as a join per product, so a catalog of a few thousand rows costs a
  /// constant number of queries instead of one per row.
  Future<List<CatalogProduct>> productsWithParents(TenantScope scope) async {
    final products = await _products.findAll(scope);
    if (products.isEmpty) return const [];

    // Awaited rather than collected through Future.wait: the result types
    // differ per parent, and a heterogeneous Future.wait collapses to Object.
    final categoryList = await _catalog.findCategories(scope);
    final brandList = await _catalog.findBrands(scope);
    final unitList = await _catalog.findUnits(scope);
    final taxCategoryList = await _catalog.findTaxCategories(scope);
    final barcodeList = await _catalog.findAllBarcodes(scope);

    final categoryById = {for (final c in categoryList) c.id: c};
    final brandById = {for (final b in brandList) b.id: b};
    final unitById = {for (final u in unitList) u.id: u};
    final taxById = {for (final t in taxCategoryList) t.id: t};
    final primaryByProduct = {
      for (final b in barcodeList)
        if (b.isPrimary) b.productId: b,
    };

    return products
        .map(
          (p) => CatalogProduct(
            product: p,
            category: categoryById[p.categoryId],
            brand: brandById[p.brandId],
            unit: unitById[p.unitId],
            taxCategory: taxById[p.taxCategoryId],
            primaryBarcode: primaryByProduct[p.id],
          ),
        )
        .toList(growable: false);
  }

  /// Locally visible products that are not deactivated.
  Future<List<ProductSummary>> activeProducts(TenantScope scope) async {
    final rows = await _products.findAll(scope);
    return rows.where((p) => p.isActive).toList(growable: false);
  }

  // --------------------------------------------------------------- barcodes

  /// The primary barcode of a product, or null when it has none.
  ///
  /// A product is not required to have a primary barcode (ASM-052), so null is
  /// a normal answer rather than a failure.
  Future<ProductBarcodeEntry?> primaryBarcode(
    TenantScope scope,
    String productId,
  ) => _catalog.findPrimaryBarcode(scope, productId);

  Future<List<ProductBarcodeEntry>> barcodesForProduct(
    TenantScope scope,
    String productId,
  ) => _catalog.findBarcodesForProduct(scope, productId);

  // ----------------------------------------------------------------- prices

  /// Every price period held for a product, across all price types.
  Future<List<ProductPricePeriod>> pricesForProduct(
    TenantScope scope,
    String productId,
  ) => _catalog.findPricesForProduct(scope, productId);

  /// The price in force for a product and price type at [at].
  ///
  /// Mirrors the server rule from 05.08 exactly: periods are half-open
  /// `[effectiveFrom, effectiveTo)`, a null end is open-ended, and two periods
  /// of one price type never intersect. Returns null when no period covers the
  /// instant, which is the normal answer before a product has any price or in
  /// a gap between two scheduled changes.
  ///
  /// Which price type a sale should use is not decided here. That is a business
  /// rule this task does not define, and defaulting one would invent it.
  Future<ProductPricePeriod?> priceAt(
    TenantScope scope, {
    required String productId,
    required String priceType,
    DateTime? at,
  }) => _catalog.findPriceEffectiveAt(
    scope,
    productId: productId,
    priceType: priceType,
    at: at ?? DateTime.now().toUtc(),
  );

  // ---------------------------------------------------------- unit conversion

  /// Converts [quantity] expressed in [fromUnitId] into [toUnitId].
  ///
  /// Uses only an explicitly stored conversion row. A missing row returns null
  /// rather than assuming a 1:1 identity, because inventing a factor would
  /// silently price or count stock wrong. Reciprocals are separate rows on the
  /// server and are never derived (ASM-050).
  ///
  /// [Decimal] arithmetic is exact, so the result carries no floating-point
  /// error even across repeated conversions.
  Future<Decimal?> convertQuantity(
    TenantScope scope, {
    required Decimal quantity,
    required String fromUnitId,
    required String toUnitId,
  }) async {
    final conversion = await _catalog.findUnitConversion(
      scope,
      fromUnitId: fromUnitId,
      toUnitId: toUnitId,
    );
    if (conversion == null) return null;
    return multiplyDecimal(
      quantity,
      conversion.multiplier,
      scale: quantity.scale,
    );
  }

  // ----------------------------------------------------------------- refresh

  /// Replaces the catalog parents for [scope] with server-authoritative rows.
  ///
  /// Each table is replaced rather than merged because catalog master data is
  /// server-wins (brain/OFFLINE_SYNC.md Master Data), and a row the server has
  /// deleted must not linger in an offline picker forever. This is safe
  /// precisely because it is not applied to transaction history: prices are
  /// append-only and are replaced per product and price type instead.
  Future<void> refreshCatalogParents(
    TenantScope scope, {
    required List<CategorySummary> categories,
    required List<BrandSummary> brands,
    required List<UnitSummary> units,
    required List<TaxCategorySummary> taxCategories,
    List<UnitConversionSummary> unitConversions = const [],
  }) async {
    await _catalog.replaceCategories(scope, categories);
    await _catalog.replaceBrands(scope, brands);
    await _catalog.replaceUnits(scope, units);
    await _catalog.replaceTaxCategories(scope, taxCategories);
    await _catalog.replaceUnitConversions(scope, unitConversions);
  }

  /// Replaces the prices of one product and price type.
  Future<void> replacePrices(
    TenantScope scope,
    String productId,
    String priceType,
    List<ProductPricePeriod> periods,
  ) => _catalog.replacePricesForProduct(scope, productId, priceType, periods);
}

/// Multiplies two decimals and returns the result at [scale].
///
/// `a/10^sa * b/10^sb == (a*b)/10^(sa+sb)`, so the raw integer product is
/// formed first and rescaled down once, rounding half away from zero. This
/// keeps `3 * 12 == 36` exact where the float64 equivalent would not, which is
/// what stops weighted-average costing drifting over many lines (BR-018).
Decimal multiplyDecimal(Decimal a, Decimal b, {required int scale}) {
  final rawProduct = a.unscaled * b.unscaled;
  final fromScale = a.scale + b.scale;
  return Decimal(
    _rescaleHalfAwayFromZero(rawProduct, fromScale, scale),
    scale: scale,
  );
}

/// Rescales an integer expressed at [fromScale] to [toScale], rounding half
/// away from zero so repeated downscaling does not systematically lose value.
int _rescaleHalfAwayFromZero(int value, int fromScale, int toScale) {
  if (fromScale == toScale) return value;
  if (fromScale < toScale) {
    var factor = 1;
    for (var i = 0; i < toScale - fromScale; i++) {
      factor *= 10;
    }
    return value * factor;
  }
  var divisor = 1;
  for (var i = 0; i < fromScale - toScale; i++) {
    divisor *= 10;
  }
  final quotient = value ~/ divisor;
  final remainder = (value % divisor).abs();
  final roundAway = remainder * 2 >= divisor;
  final magnitude = quotient.abs() + (roundAway ? 1 : 0);
  return value.isNegative ? -magnitude : magnitude;
}
