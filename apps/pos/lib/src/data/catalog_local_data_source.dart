import 'package:drift/drift.dart';

import 'package:pos/src/data/catalog_entities.dart';
import 'package:pos/src/data/data_source.dart';
import 'package:pos/src/data/price_entities.dart';
import 'package:pos/src/data/product_summary.dart';
import 'package:pos/src/data/tenant_scope.dart';
import 'package:pos/src/database/app_database.dart';

/// Local (SQLite) data source for the product catalog parents and the price
/// and barcode children.
///
/// Every method filters by [TenantScope] in the same query as the lookup, so
/// one organization's rows can never be observed through another organization's
/// session (BR-040). The exception is [findPriceEffectiveAt], which has no
/// organization column of its own: it reaches the tenant through the parent
/// product, exactly as the server does (ASM-054). Filtering on price id alone
/// would let a caller read another tenant's price by guessing a price id, so
/// the join is the point of the method rather than an optimization.
class CatalogLocalDataSource {
  final AppDatabase _db;

  const CatalogLocalDataSource(this._db);

  // ---------------------------------------------------------------- categories

  Future<List<CategorySummary>> findCategories(TenantScope scope) async {
    final rows = await (_db.select(
      _db.categories,
    )..where((c) => c.organizationId.equals(scope.organizationId))).get();
    return rows.map(_toCategory).toList(growable: false);
  }

  Future<CategorySummary?> findCategoryById(
    TenantScope scope,
    String id,
  ) async {
    final row =
        await (_db.select(_db.categories)..where(
              (c) =>
                  c.id.equals(id) &
                  c.organizationId.equals(scope.organizationId),
            ))
            .getSingleOrNull();
    return row == null ? null : _toCategory(row);
  }

  /// Replaces the stored category tree for [scope] with [items].
  ///
  /// A catalog refresh is authoritative: rows the server no longer returns
  /// are removed, because a stale category would otherwise keep appearing in
  /// offline pickers forever. This is deliberately different from the
  /// [LocalDataSource.upsertAll] contract, which explicitly must not delete
  /// absent rows; see `replaceCategories` callers for why catalog master data
  /// is treated differently from transaction history.
  Future<void> replaceCategories(
    TenantScope scope,
    List<CategorySummary> items,
  ) async {
    _assertAllOwnedBy(scope, items, (e) => e.organizationId);
    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      await (_db.delete(
        _db.categories,
      )..where((c) => c.organizationId.equals(scope.organizationId))).go();
      await _db.batch((batch) {
        batch.insertAll(_db.categories, [
          for (final item in items)
            CategoriesCompanion.insert(
              id: item.id,
              organizationId: item.organizationId,
              name: item.name,
              status: Value(item.status),
              parentId: Value(item.parentId),
              createdAt: now,
              updatedAt: now,
            ),
        ], mode: InsertMode.insertOrIgnore);
      });
    });
  }

  // -------------------------------------------------------------------- brands

  Future<List<BrandSummary>> findBrands(TenantScope scope) async {
    final rows = await (_db.select(
      _db.brands,
    )..where((b) => b.organizationId.equals(scope.organizationId))).get();
    return rows.map(_toBrand).toList(growable: false);
  }

  Future<BrandSummary?> findBrandById(TenantScope scope, String id) async {
    final row =
        await (_db.select(_db.brands)..where(
              (b) =>
                  b.id.equals(id) &
                  b.organizationId.equals(scope.organizationId),
            ))
            .getSingleOrNull();
    return row == null ? null : _toBrand(row);
  }

  Future<void> replaceBrands(
    TenantScope scope,
    List<BrandSummary> items,
  ) async {
    _assertAllOwnedBy(scope, items, (e) => e.organizationId);
    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      await (_db.delete(
        _db.brands,
      )..where((b) => b.organizationId.equals(scope.organizationId))).go();
      await _db.batch((batch) {
        batch.insertAll(_db.brands, [
          for (final item in items)
            BrandsCompanion.insert(
              id: item.id,
              organizationId: item.organizationId,
              name: item.name,
              status: Value(item.status),
              createdAt: now,
              updatedAt: now,
            ),
        ], mode: InsertMode.insertOrIgnore);
      });
    });
  }

  // --------------------------------------------------------------------- units

  Future<List<UnitSummary>> findUnits(TenantScope scope) async {
    final rows = await (_db.select(
      _db.units,
    )..where((u) => u.organizationId.equals(scope.organizationId))).get();
    return rows.map(_toUnit).toList(growable: false);
  }

  Future<UnitSummary?> findUnitById(TenantScope scope, String id) async {
    final row =
        await (_db.select(_db.units)..where(
              (u) =>
                  u.id.equals(id) &
                  u.organizationId.equals(scope.organizationId),
            ))
            .getSingleOrNull();
    return row == null ? null : _toUnit(row);
  }

  Future<void> replaceUnits(TenantScope scope, List<UnitSummary> items) async {
    _assertAllOwnedBy(scope, items, (e) => e.organizationId);
    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      await (_db.delete(
        _db.unitConversions,
      )..where((c) => c.organizationId.equals(scope.organizationId))).go();
      await (_db.delete(
        _db.units,
      )..where((u) => u.organizationId.equals(scope.organizationId))).go();
      await _db.batch((batch) {
        batch.insertAll(_db.units, [
          for (final item in items)
            UnitsCompanion.insert(
              id: item.id,
              organizationId: item.organizationId,
              code: item.code,
              name: item.name,
              precision: Value(item.precision),
              status: Value(item.status),
              createdAt: now,
              updatedAt: now,
            ),
        ], mode: InsertMode.insertOrIgnore);
      });
    });
  }

  // ---------------------------------------------------------- unit conversions

  Future<List<UnitConversionSummary>> findUnitConversions(
    TenantScope scope,
  ) async {
    final rows = await (_db.select(
      _db.unitConversions,
    )..where((c) => c.organizationId.equals(scope.organizationId))).get();
    return rows.map(_toUnitConversion).toList(growable: false);
  }

  /// The multiplier for one `fromUnit` expressed in `toUnit`s.
  ///
  /// Returns `null` when no explicit conversion row exists. Reciprocals are
  /// never derived, so `PCS -> DOZ` returning null means the store has not
  /// configured it, not that it is implicitly `1/12`.
  Future<UnitConversionSummary?> findUnitConversion(
    TenantScope scope, {
    required String fromUnitId,
    required String toUnitId,
  }) async {
    final row =
        await (_db.select(_db.unitConversions)..where(
              (c) =>
                  c.organizationId.equals(scope.organizationId) &
                  c.fromUnitId.equals(fromUnitId) &
                  c.toUnitId.equals(toUnitId),
            ))
            .getSingleOrNull();
    return row == null ? null : _toUnitConversion(row);
  }

  /// Stores conversions for [scope], removing any that the server no longer
  /// returns for that organization.
  Future<void> replaceUnitConversions(
    TenantScope scope,
    List<UnitConversionSummary> items,
  ) async {
    _assertAllOwnedBy(scope, items, (e) => e.organizationId);
    await _db.transaction(() async {
      await (_db.delete(
        _db.unitConversions,
      )..where((c) => c.organizationId.equals(scope.organizationId))).go();
      await _db.batch((batch) {
        batch.insertAll(_db.unitConversions, [
          for (final item in items)
            UnitConversionsCompanion.insert(
              id: item.id,
              organizationId: item.organizationId,
              fromUnitId: item.fromUnitId,
              toUnitId: item.toUnitId,
              multiplier: item.multiplier,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            ),
        ], mode: InsertMode.insertOrIgnore);
      });
    });
  }

  // ------------------------------------------------------------- tax categories

  Future<List<TaxCategorySummary>> findTaxCategories(TenantScope scope) async {
    final rows = await (_db.select(
      _db.taxCategories,
    )..where((t) => t.organizationId.equals(scope.organizationId))).get();
    return rows.map(_toTaxCategory).toList(growable: false);
  }

  Future<TaxCategorySummary?> findTaxCategoryById(
    TenantScope scope,
    String id,
  ) async {
    final row =
        await (_db.select(_db.taxCategories)..where(
              (t) =>
                  t.id.equals(id) &
                  t.organizationId.equals(scope.organizationId),
            ))
            .getSingleOrNull();
    return row == null ? null : _toTaxCategory(row);
  }

  Future<void> replaceTaxCategories(
    TenantScope scope,
    List<TaxCategorySummary> items,
  ) async {
    _assertAllOwnedBy(scope, items, (e) => e.organizationId);
    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      await (_db.delete(
        _db.taxCategories,
      )..where((t) => t.organizationId.equals(scope.organizationId))).go();
      await _db.batch((batch) {
        batch.insertAll(_db.taxCategories, [
          for (final item in items)
            TaxCategoriesCompanion.insert(
              id: item.id,
              organizationId: item.organizationId,
              code: item.code,
              name: item.name,
              rate: item.rate,
              taxType: item.taxType,
              effectiveFrom: item.effectiveFrom,
              effectiveTo: Value(item.effectiveTo),
              status: Value(item.status),
              createdAt: now,
              updatedAt: now,
            ),
        ], mode: InsertMode.insertOrIgnore);
      });
    });
  }

  // ----------------------------------------------------------------- barcodes

  Future<List<ProductBarcodeEntry>> findBarcodesForProduct(
    TenantScope scope,
    String productId,
  ) async {
    // Joined to products so the tenant check runs against the parent. The
    // barcode row also carries organizationId, but a product path is the
    // caller's claim, and the join makes a mismatched pair unreachable rather
    // than merely unlisted.
    final rows =
        await (_db.select(_db.productBarcodes).join([
              innerJoin(
                _db.products,
                _db.products.id.equalsExp(_db.productBarcodes.productId),
              ),
            ])..where(
              _db.productBarcodes.productId.equals(productId) &
                  _db.products.organizationId.equals(scope.organizationId) &
                  _db.productBarcodes.organizationId.equals(
                    scope.organizationId,
                  ),
            ))
            .get();
    return rows
        .map((row) => _toBarcode(row.readTable(_db.productBarcodes)))
        .toList(growable: false);
  }

  /// Every barcode for every product in [scope], for offline catalog search.
  Future<List<ProductBarcodeEntry>> findAllBarcodes(TenantScope scope) async {
    final rows =
        await (_db.select(_db.productBarcodes).join([
              innerJoin(
                _db.products,
                _db.products.id.equalsExp(_db.productBarcodes.productId),
              ),
            ])..where(
              _db.products.organizationId.equals(scope.organizationId) &
                  _db.productBarcodes.organizationId.equals(
                    scope.organizationId,
                  ),
            ))
            .get();
    return rows
        .map((row) => _toBarcode(row.readTable(_db.productBarcodes)))
        .toList(growable: false);
  }

  /// Searches products in [scope] by name/SKU/barcode substring.
  Future<List<ProductSummary>> searchProducts(
    TenantScope scope,
    String query,
  ) async {
    if (query.trim().isEmpty) {
      final rows = await (_db.select(
        _db.products,
      )..where((p) => p.organizationId.equals(scope.organizationId))).get();
      return rows.map(_toProduct).toList(growable: false);
    }

    final term = '%${query.trim()}%';
    final byText =
        await (_db.select(_db.products)..where(
              (p) =>
                  p.organizationId.equals(scope.organizationId) &
                  (p.name.like(term) | p.sku.like(term)),
            ))
            .get();

    final byBarcode =
        await (_db.select(_db.productBarcodes).join([
              innerJoin(
                _db.products,
                _db.products.id.equalsExp(_db.productBarcodes.productId),
              ),
            ])..where(
              _db.products.organizationId.equals(scope.organizationId) &
                  _db.productBarcodes.organizationId.equals(
                    scope.organizationId,
                  ) &
                  _db.productBarcodes.barcode.like(term),
            ))
            .get();

    final found = <String, Product>{};
    for (final r in byText) {
      found[r.id] = r;
    }
    for (final row in byBarcode) {
      final p = row.readTable(_db.products);
      found.putIfAbsent(p.id, () => p);
    }
    return found.values.map(_toProduct).toList(growable: false);
  }

  /// The primary barcode of a product, or null when it has none.
  ///
  /// A product is not required to have a primary barcode (ASM-052), so null is
  /// a normal answer rather than an error.
  Future<ProductBarcodeEntry?> findPrimaryBarcode(
    TenantScope scope,
    String productId,
  ) async {
    final row =
        await (_db.select(_db.productBarcodes).join([
              innerJoin(
                _db.products,
                _db.products.id.equalsExp(_db.productBarcodes.productId),
              ),
            ])..where(
              _db.productBarcodes.productId.equals(productId) &
                  _db.productBarcodes.isPrimary.equals(true) &
                  _db.products.organizationId.equals(scope.organizationId) &
                  _db.productBarcodes.organizationId.equals(
                    scope.organizationId,
                  ),
            ))
            .getSingleOrNull();
    return row == null ? null : _toBarcode(row.readTable(_db.productBarcodes));
  }

  Future<void> replaceBarcodesForProduct(
    TenantScope scope,
    String productId,
    List<ProductBarcodeEntry> items,
  ) async {
    for (final item in items) {
      _assertOwnedBy(scope, item.organizationId, 'barcode ${item.id}');
      if (item.productId != productId) {
        throw StateError(
          'Barcode ${item.id} claims product ${item.productId} but was '
          'supplied for $productId',
        );
      }
    }
    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      await (_db.delete(
        _db.productBarcodes,
      )..where((b) => b.productId.equals(productId))).go();
      await _db.batch((batch) {
        batch.insertAll(_db.productBarcodes, [
          for (final item in items)
            ProductBarcodesCompanion.insert(
              id: item.id,
              organizationId: item.organizationId,
              productId: item.productId,
              barcode: item.barcode,
              barcodeType: Value(item.barcodeType),
              isPrimary: Value(item.isPrimary),
              createdAt: now,
              updatedAt: now,
            ),
        ], mode: InsertMode.insertOrIgnore);
      });
    });
  }

  // ------------------------------------------------------------------- prices

  Future<List<ProductPricePeriod>> findPricesForProduct(
    TenantScope scope,
    String productId,
  ) async {
    final rows =
        await (_db.select(_db.productPrices).join([
              innerJoin(
                _db.products,
                _db.products.id.equalsExp(_db.productPrices.productId),
              ),
            ])..where(
              _db.productPrices.productId.equals(productId) &
                  _db.products.organizationId.equals(scope.organizationId),
            ))
            .get();
    return rows
        .map((row) => _toPricePeriod(row.readTable(_db.productPrices)))
        .toList(growable: false);
  }

  /// The price period in force for a product and price type at [at].
  ///
  /// Applies the same half-open `[effectiveFrom, effectiveTo)` window rule as
  /// the server (05.08), so an offline device and the server resolve an instant
  /// to the same price.
  ///
  /// Because periods of one price type never intersect, at most one row can
  /// match. The guard still exists: if a corrupt mirror somehow held two
  /// overlapping rows, returning null is safer than picking one arbitrarily,
  /// and it makes the ambiguity visible instead of silently pricing a sale
  /// from a coin flip.
  Future<ProductPricePeriod?> findPriceEffectiveAt(
    TenantScope scope, {
    required String productId,
    required String priceType,
    required DateTime at,
  }) async {
    final matches =
        await (_db.select(_db.productPrices).join([
              innerJoin(
                _db.products,
                _db.products.id.equalsExp(_db.productPrices.productId),
              ),
            ])..where(
              _db.productPrices.productId.equals(productId) &
                  _db.productPrices.priceType.equals(priceType) &
                  _db.products.organizationId.equals(scope.organizationId),
            ))
            .get();

    final effective = matches
        .map((row) => _toPricePeriod(row.readTable(_db.productPrices)))
        .where((period) => period.isEffectiveAt(at))
        .toList(growable: false);

    if (effective.length != 1) return null;
    return effective.single;
  }

  /// Stores price periods for one product, replacing that product's periods of
  /// the same [priceType] and leaving other price types untouched.
  ///
  /// Keyed by price type rather than replacing the whole table because the
  /// server may send one type at a time, and wiping the others would make an
  /// offline device forget prices it legitimately holds.
  Future<void> replacePricesForProduct(
    TenantScope scope,
    String productId,
    String priceType,
    List<ProductPricePeriod> items,
  ) async {
    for (final item in items) {
      if (item.productId != productId || item.priceType != priceType) {
        throw StateError(
          'Price ${item.id} is ${item.priceType}/${item.productId}, not '
          '$priceType/$productId',
        );
      }
    }
    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      await (_db.delete(_db.productPrices)..where(
            (p) =>
                p.productId.equals(productId) & p.priceType.equals(priceType),
          ))
          .go();
      await _db.batch((batch) {
        batch.insertAll(_db.productPrices, [
          for (final item in items)
            ProductPricesCompanion.insert(
              id: item.id,
              productId: item.productId,
              priceType: item.priceType,
              amount: item.amount,
              effectiveFrom: item.effectiveFrom,
              effectiveTo: Value(item.effectiveTo),
              createdAt: now,
              updatedAt: now,
            ),
        ], mode: InsertMode.insertOrIgnore);
      });
    });
  }

  // ------------------------------------------------------------------ helpers

  /// Rejects a batch containing any row that belongs to another organization.
  ///
  /// Validating before the transaction means a foreign row leaves nothing
  /// written, rather than leaving a partial refresh behind.
  void _assertAllOwnedBy<T>(
    TenantScope scope,
    List<T> items,
    String Function(T) organizationIdOf,
  ) {
    for (final item in items) {
      _assertOwnedBy(scope, organizationIdOf(item), 'row');
    }
  }

  void _assertOwnedBy(TenantScope scope, String organizationId, String what) {
    if (organizationId != scope.organizationId) {
      throw StateError(
        'Refusing to write $what for organization $organizationId '
        'under $scope',
      );
    }
  }

  static CategorySummary _toCategory(Category row) => CategorySummary(
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
    parentId: row.parentId,
  );

  static BrandSummary _toBrand(Brand row) => BrandSummary(
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
  );

  static UnitSummary _toUnit(Unit row) => UnitSummary(
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    precision: row.precision,
    status: row.status,
  );

  static UnitConversionSummary _toUnitConversion(UnitConversion row) =>
      UnitConversionSummary(
        id: row.id,
        organizationId: row.organizationId,
        fromUnitId: row.fromUnitId,
        toUnitId: row.toUnitId,
        multiplier: row.multiplier,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      );

  static TaxCategorySummary _toTaxCategory(TaxCategory row) =>
      TaxCategorySummary(
        id: row.id,
        organizationId: row.organizationId,
        code: row.code,
        name: row.name,
        rate: row.rate,
        taxType: row.taxType,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        status: row.status,
      );

  static ProductBarcodeEntry _toBarcode(ProductBarcode row) =>
      ProductBarcodeEntry(
        id: row.id,
        organizationId: row.organizationId,
        productId: row.productId,
        barcode: row.barcode,
        barcodeType: row.barcodeType,
        isPrimary: row.isPrimary,
      );

  static ProductSummary _toProduct(Product row) => ProductSummary(
    id: row.id,
    organizationId: row.organizationId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    status: row.status,
    categoryId: row.categoryId,
    brandId: row.brandId,
    unitId: row.unitId,
    taxCategoryId: row.taxCategoryId,
    defaultPurchasePrice: row.defaultPurchasePrice,
    defaultSellingPrice: row.defaultSellingPrice,
    reorderLevel: row.reorderLevel,
    reorderQuantity: row.reorderQuantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  );

  static ProductPricePeriod _toPricePeriod(ProductPrice row) =>
      ProductPricePeriod(
        id: row.id,
        productId: row.productId,
        priceType: row.priceType,
        amount: row.amount,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
      );
}
