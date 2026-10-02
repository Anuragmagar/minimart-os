import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos/src/data/catalog_entities.dart';
import 'package:pos/src/data/catalog_local_data_source.dart';
import 'package:pos/src/data/catalog_repository.dart';
import 'package:pos/src/data/price_entities.dart';
import 'package:pos/src/data/product_local_data_source.dart';
import 'package:pos/src/data/product_summary.dart';
import 'package:pos/src/data/tenant_scope.dart';
import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/database/database_service.dart';
import 'package:pos/src/database/decimal.dart';

import '../setup.dart';

const _orgA = 'org-a';
const _orgB = 'org-b';

const _scopeA = TenantScope(organizationId: _orgA);
const _scopeB = TenantScope(organizationId: _orgB);

void main() {
  setUpAll(configureTestDrift);

  late AppDatabase db;
  late ProductLocalDataSource products;
  late CatalogLocalDataSource catalog;
  late ProductCatalogDataRepository repository;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    products = ProductLocalDataSource(db);
    catalog = CatalogLocalDataSource(db);
    repository = ProductCatalogDataRepository(products, catalog);
  });

  tearDown(() => db.close());

  Future<void> seedProduct(
    String id, {
    required String org,
    String? sku,
    String name = 'Product',
    String status = 'active',
    String? categoryId,
    String? brandId,
    String? unitId,
    String? taxCategoryId,
  }) async {
    await db
        .into(db.products)
        .insert(
          ProductsCompanion.insert(
            id: id,
            organizationId: org,
            sku: sku ?? 'SKU-$id',
            name: name,
            status: Value(status),
            categoryId: Value(categoryId),
            brandId: Value(brandId),
            unitId: Value(unitId),
            taxCategoryId: Value(taxCategoryId),
            createdAt: DateTime.utc(2026, 1, 1),
            updatedAt: DateTime.utc(2026, 1, 1),
          ),
        );
  }

  Future<void> seedPrice({
    required String id,
    required String productId,
    required Decimal amount,
    required DateTime from,
    DateTime? to,
    String priceType = 'retail',
  }) async {
    await db
        .into(db.productPrices)
        .insert(
          ProductPricesCompanion.insert(
            id: id,
            productId: productId,
            priceType: priceType,
            amount: amount,
            effectiveFrom: from,
            effectiveTo: Value(to),
            createdAt: DateTime.utc(2026, 1, 1),
            updatedAt: DateTime.utc(2026, 1, 1),
          ),
        );
  }

  group('schemaVersion 2 migration', () {
    test('creates unit_conversions and the lookup indexes', () async {
      // Touching the database forces the migration to run.
      await db.customSelect('SELECT 1').get();

      final version = await db.customSelect('PRAGMA user_version').getSingle();
      expect(version.read<int>('user_version'), 2);

      final tables = await db
          .customSelect("SELECT name FROM sqlite_master WHERE type='table'")
          .get();
      final names = tables.map((r) => r.read<String>('name')).toSet();
      expect(names, contains('unit_conversions'));

      final indexes = await db
          .customSelect("SELECT name FROM sqlite_master WHERE type='index'")
          .get();
      final indexNames = indexes.map((r) => r.read<String>('name')).toSet();
      expect(
        indexNames,
        containsAll([
          'unit_conversions_from_to',
          'unit_conversions_to_unit',
          'product_barcodes_barcode',
          'product_barcodes_product',
          'product_prices_product_type_from',
        ]),
      );
    });
  });

  group('price window resolution mirrors the server rule', () {
    // The server rule (05.08) is half-open [effectiveFrom, effectiveTo) with a
    // null end meaning open-ended. These cases pin the boundaries so an
    // offline device cannot drift from server pricing.
    final from = DateTime.utc(2026, 1, 1);
    final boundary = DateTime.utc(2026, 6, 1);

    setUp(() async {
      await seedProduct('p1', org: _orgA);
      await seedPrice(
        id: 'price-1',
        productId: 'p1',
        amount: const Decimal(1000, scale: 2),
        from: from,
        to: boundary,
      );
      await seedPrice(
        id: 'price-2',
        productId: 'p1',
        amount: const Decimal(1200, scale: 2),
        from: boundary,
        to: null,
      );
    });

    test('resolves the first period before the boundary', () async {
      final price = await repository.priceAt(
        _scopeA,
        productId: 'p1',
        priceType: 'retail',
        at: DateTime.utc(2026, 3, 15),
      );
      expect(price!.id, 'price-1');
      expect(price.amount, const Decimal(1000, scale: 2));
    });

    test(
      'resolves the successor at the exact shared boundary instant',
      () async {
        // Half-open means the instant a predecessor ends belongs to the
        // successor, not to both and not to neither.
        final price = await repository.priceAt(
          _scopeA,
          productId: 'p1',
          priceType: 'retail',
          at: boundary,
        );
        expect(price!.id, 'price-2');
      },
    );

    test(
      'resolves one millisecond before the boundary to the predecessor',
      () async {
        final price = await repository.priceAt(
          _scopeA,
          productId: 'p1',
          priceType: 'retail',
          at: boundary.subtract(const Duration(milliseconds: 1)),
        );
        expect(price!.id, 'price-1');
      },
    );

    test('returns null before any period starts', () async {
      final price = await repository.priceAt(
        _scopeA,
        productId: 'p1',
        priceType: 'retail',
        at: from.subtract(const Duration(microseconds: 1)),
      );
      expect(price, isNull);
    });

    test('keeps price types independent', () async {
      await seedPrice(
        id: 'price-wholesale',
        productId: 'p1',
        amount: const Decimal(900, scale: 2),
        from: from,
        priceType: 'wholesale',
      );

      final retail = await repository.priceAt(
        _scopeA,
        productId: 'p1',
        priceType: 'retail',
        at: DateTime.utc(2026, 3, 15),
      );
      final wholesale = await repository.priceAt(
        _scopeA,
        productId: 'p1',
        priceType: 'wholesale',
        at: DateTime.utc(2026, 3, 15),
      );

      expect(retail!.amount, const Decimal(1000, scale: 2));
      expect(wholesale!.amount, const Decimal(900, scale: 2));
    });

    test(
      'priceType is case-sensitive, so Retail is a separate series',
      () async {
        final retail = await repository.priceAt(
          _scopeA,
          productId: 'p1',
          priceType: 'retail',
          at: DateTime.utc(2026, 3, 15),
        );
        final capitalised = await repository.priceAt(
          _scopeA,
          productId: 'p1',
          priceType: 'Retail',
          at: DateTime.utc(2026, 3, 15),
        );

        expect(retail, isNotNull);
        expect(capitalised, isNull);
      },
    );

    test('returns null rather than guessing when rows overlap', () async {
      // The server prevents this. A corrupt mirror must not silently price a
      // sale from an arbitrary row.
      await seedProduct('p-overlap', org: _orgA);
      await seedPrice(
        id: 'ov-1',
        productId: 'p-overlap',
        amount: const Decimal(100, scale: 2),
        from: DateTime.utc(2026, 1, 1),
        to: DateTime.utc(2026, 12, 1),
      );
      await seedPrice(
        id: 'ov-2',
        productId: 'p-overlap',
        amount: const Decimal(200, scale: 2),
        from: DateTime.utc(2026, 6, 1),
        to: null,
      );

      final price = await repository.priceAt(
        _scopeA,
        productId: 'p-overlap',
        priceType: 'retail',
        at: DateTime.utc(2026, 7, 1),
      );
      expect(price, isNull);
    });

    test('price amount keeps exact decimal precision', () async {
      await seedProduct('p-exact', org: _orgA);
      await seedPrice(
        id: 'exact-1',
        productId: 'p-exact',
        amount: Decimal.parse('150.55', scale: 2),
        from: from,
      );

      final price = await repository.priceAt(
        _scopeA,
        productId: 'p-exact',
        priceType: 'retail',
        at: DateTime.utc(2026, 2, 1),
      );
      expect(price!.amount.unscaled, 15055);
    });
  });

  group('tenant isolation', () {
    test('price resolution cannot read another organization product', () async {
      await seedProduct('p-b', org: _orgB);
      await seedPrice(
        id: 'price-b',
        productId: 'p-b',
        amount: const Decimal(500, scale: 2),
        from: DateTime.utc(2026, 1, 1),
      );

      final price = await repository.priceAt(
        _scopeA,
        productId: 'p-b',
        priceType: 'retail',
        at: DateTime.utc(2026, 2, 1),
      );
      expect(price, isNull);
    });

    test('categories are scoped to the caller organization', () async {
      await catalog.replaceCategories(_scopeB, const [
        CategorySummary(
          id: 'cat-b',
          organizationId: _orgB,
          name: 'Foreign',
          status: 'active',
        ),
      ]);
      await catalog.replaceCategories(_scopeA, const [
        CategorySummary(
          id: 'cat-a',
          organizationId: _orgA,
          name: 'Mine',
          status: 'active',
        ),
      ]);

      expect((await repository.categories(_scopeA)).single.name, 'Mine');
      expect((await repository.categories(_scopeB)).single.name, 'Foreign');
    });

    test('refresh refuses a row belonging to another organization', () {
      expect(
        () => catalog.replaceBrands(_scopeA, const [
          BrandSummary(
            id: 'brand-x',
            organizationId: _orgB,
            name: 'Foreign',
            status: 'active',
          ),
        ]),
        throwsStateError,
      );
    });

    test('a refused refresh leaves nothing written', () async {
      await catalog.replaceBrands(_scopeA, const [
        BrandSummary(
          id: 'brand-a',
          organizationId: _orgA,
          name: 'Existing',
          status: 'active',
        ),
      ]);

      expect(
        () => catalog.replaceBrands(_scopeA, const [
          BrandSummary(
            id: 'brand-new',
            organizationId: _orgA,
            name: 'Fine',
            status: 'active',
          ),
          BrandSummary(
            id: 'brand-foreign',
            organizationId: _orgB,
            name: 'Foreign',
            status: 'active',
          ),
        ]),
        throwsStateError,
      );

      // Validation runs before the transaction, so the good row in the same
      // batch must not have been written either.
      final brands = await repository.brands(_scopeA);
      expect(brands.map((b) => b.id), ['brand-a']);
    });

    test('barcodes of another organization product stay unreachable', () async {
      await seedProduct('p-b', org: _orgB);
      await db
          .into(db.productBarcodes)
          .insert(
            ProductBarcodesCompanion.insert(
              id: 'bc-b',
              organizationId: _orgB,
              productId: 'p-b',
              barcode: '9800000000017',
              createdAt: DateTime.utc(2026, 1, 1),
              updatedAt: DateTime.utc(2026, 1, 1),
            ),
          );

      final found = await repository.primaryBarcode(_scopeA, 'p-b');
      expect(found, isNull);
      expect(await repository.barcodesForProduct(_scopeA, 'p-b'), isEmpty);
    });
  });

  group('catalog parents', () {
    test('productWithParents resolves every parent', () async {
      await catalog.replaceCategories(_scopeA, const [
        CategorySummary(
          id: 'cat-1',
          organizationId: _orgA,
          name: 'Beverages',
          status: 'active',
        ),
      ]);
      await catalog.replaceBrands(_scopeA, const [
        BrandSummary(
          id: 'brand-1',
          organizationId: _orgA,
          name: 'Parle',
          status: 'active',
        ),
      ]);
      await catalog.replaceUnits(_scopeA, const [
        UnitSummary(
          id: 'unit-1',
          organizationId: _orgA,
          code: 'PCS',
          name: 'Pieces',
          precision: 0,
          status: 'active',
        ),
      ]);
      await catalog.replaceTaxCategories(_scopeA, [
        TaxCategorySummary(
          id: 'tax-1',
          organizationId: _orgA,
          code: 'VAT13',
          name: 'VAT 13%',
          rate: Decimal.parse('13.0000', scale: 4),
          taxType: 'VAT',
          effectiveFrom: DateTime.utc(2026, 1, 1),
          status: 'active',
        ),
      ]);
      await seedProduct(
        'p1',
        org: _orgA,
        categoryId: 'cat-1',
        brandId: 'brand-1',
        unitId: 'unit-1',
        taxCategoryId: 'tax-1',
      );

      final row = await repository.productWithParents(_scopeA, 'p1');

      expect(row!.category!.name, 'Beverages');
      expect(row.brand!.name, 'Parle');
      expect(row.unit!.code, 'PCS');
      expect(row.taxCategory!.rate, Decimal.parse('13.0000', scale: 4));
      expect(row.displayName, 'Parle / Beverages Product');
    });

    test('a product with no parents resolves with all parents null', () async {
      await seedProduct('p1', org: _orgA);
      final row = await repository.productWithParents(_scopeA, 'p1');
      expect(row!.category, isNull);
      expect(row.brand, isNull);
      expect(row.unit, isNull);
      expect(row.taxCategory, isNull);
      expect(row.displayName, 'Product');
    });

    test('productsWithParents matches parents by id', () async {
      await catalog.replaceBrands(_scopeA, const [
        BrandSummary(
          id: 'brand-1',
          organizationId: _orgA,
          name: 'Parle',
          status: 'active',
        ),
      ]);
      await seedProduct('p1', org: _orgA, brandId: 'brand-1', name: 'G');
      await seedProduct('p2', org: _orgA, name: 'NoBrand');
      await seedProduct('p3', org: _orgB, name: 'Foreign');

      final rows = await repository.productsWithParents(_scopeA);

      expect(rows.map((r) => r.id).toSet(), {'p1', 'p2'});
      expect(rows.firstWhere((r) => r.id == 'p1').brand!.name, 'Parle');
      expect(rows.firstWhere((r) => r.id == 'p2').brand, isNull);
    });

    test('tax category window uses the same half-open rule', () async {
      final tax = TaxCategorySummary(
        id: 'tax-1',
        organizationId: _orgA,
        code: 'VAT13',
        name: 'VAT 13%',
        rate: const Decimal(130000, scale: 4),
        taxType: 'VAT',
        effectiveFrom: _boundary1,
        effectiveTo: _boundary2,
        status: 'active',
      );

      expect(tax.isEffectiveAt(_boundary1), isTrue);
      expect(tax.isEffectiveAt(_boundary2), isFalse);
      expect(
        tax.isEffectiveAt(_boundary1.subtract(const Duration(days: 1))),
        isFalse,
      );
    });

    test('activeProducts excludes deactivated products', () async {
      await seedProduct('p1', org: _orgA);
      await seedProduct('p2', org: _orgA, status: 'inactive');

      final active = await repository.activeProducts(_scopeA);
      expect(active.map((p) => p.id), ['p1']);
    });
  });

  group('unit conversion', () {
    setUp(() async {
      await catalog.replaceUnitConversions(_scopeA, [
        UnitConversionSummary(
          id: 'conv-1',
          organizationId: _orgA,
          fromUnitId: 'unit-doz',
          toUnitId: 'unit-pcs',
          // 1 DOZ = 12 PCS, stored at scale 6 like the backend Decimal(14,6).
          multiplier: Decimal.parse('12.000000', scale: 6),
          createdAt: DateTime.utc(2026, 1, 1),
          updatedAt: DateTime.utc(2026, 1, 1),
        ),
        UnitConversionSummary(
          id: 'conv-2',
          organizationId: _orgA,
          fromUnitId: 'unit-pcs',
          toUnitId: 'unit-doz',
          multiplier: Decimal.parse('0.083333', scale: 6),
          createdAt: DateTime.utc(2026, 1, 1),
          updatedAt: DateTime.utc(2026, 1, 1),
        ),
      ]);
    });

    test('converts DOZ to PCS exactly', () async {
      final result = await repository.convertQuantity(
        _scopeA,
        quantity: const Decimal(3000, scale: 3), // 3.000
        fromUnitId: 'unit-doz',
        toUnitId: 'unit-pcs',
      );
      // 3 * 12 = 36 PCS. Exact integer arithmetic, so 36.000 not 35.99999...
      expect(result!.unscaled, 36000);
      expect(result.scale, 3);
    });

    test('result carries no floating-point drift', () async {
      // 0.1 + 0.2 style drift: repeated conversion of a value whose product
      // would be inexact in binary floating point.
      final result = await repository.convertQuantity(
        _scopeA,
        quantity: const Decimal(1000, scale: 3), // 1.000
        fromUnitId: 'unit-doz',
        toUnitId: 'unit-pcs',
      );
      expect(result!.unscaled, 12000);
    });

    test('uses the stored reciprocal rather than deriving 1/12', () async {
      final result = await repository.convertQuantity(
        _scopeA,
        quantity: const Decimal(12000, scale: 3), // 12.000 PCS
        fromUnitId: 'unit-pcs',
        toUnitId: 'unit-doz',
      );
      // 12 * 0.083333 = 0.999996, which rounds to 1.000 at scale 3.
      expect(result!.unscaled, 1000);
    });

    test('returns null for an unconfigured conversion', () async {
      final result = await repository.convertQuantity(
        _scopeA,
        quantity: const Decimal(1000, scale: 3),
        fromUnitId: 'unit-box',
        toUnitId: 'unit-pcs',
      );
      // No invented 1:1 identity: a wrong guess would miscount stock.
      expect(result, isNull);
    });

    test('conversion cannot cross organizations', () async {
      final result = await repository.convertQuantity(
        _scopeB,
        quantity: const Decimal(3000, scale: 3),
        fromUnitId: 'unit-doz',
        toUnitId: 'unit-pcs',
      );
      expect(result, isNull);
    });

    test('a self conversion is stored but never synthesized', () async {
      final found = await catalog.findUnitConversion(
        _scopeA,
        fromUnitId: 'unit-doz',
        toUnitId: 'unit-doz',
      );
      expect(found, isNull);
    });
  });

  group('replacePrices', () {
    test('replaces only the given product and price type', () async {
      await seedProduct('p1', org: _orgA);
      await seedProduct('p2', org: _orgA);
      await seedPrice(
        id: 'old-retail',
        productId: 'p1',
        amount: const Decimal(100, scale: 2),
        from: DateTime.utc(2026, 1, 1),
      );
      await seedPrice(
        id: 'keep-retail',
        productId: 'p2',
        amount: const Decimal(200, scale: 2),
        from: DateTime.utc(2026, 1, 1),
      );
      await seedPrice(
        id: 'keep-wholesale',
        productId: 'p1',
        amount: const Decimal(90, scale: 2),
        from: DateTime.utc(2026, 1, 1),
        priceType: 'wholesale',
      );

      await repository.replacePrices(_scopeA, 'p1', 'retail', [
        ProductPricePeriod(
          id: 'new-retail',
          productId: 'p1',
          priceType: 'retail',
          amount: const Decimal(110, scale: 2),
          effectiveFrom: DateTime.utc(2027, 1, 1),
        ),
      ]);

      final p1 = await repository.pricesForProduct(_scopeA, 'p1');
      final p2 = await repository.pricesForProduct(_scopeA, 'p2');

      expect(p1.map((p) => p.id).toSet(), {'new-retail', 'keep-wholesale'});
      expect(p2.map((p) => p.id), ['keep-retail']);
    });

    test('rejects a period belonging to another price type', () {
      expect(
        () => repository.replacePrices(_scopeA, 'p1', 'retail', [
          ProductPricePeriod(
            id: 'mismatch',
            productId: 'p1',
            priceType: 'wholesale',
            amount: const Decimal(100, scale: 2),
            effectiveFrom: DateTime.utc(2026, 1, 1),
          ),
        ]),
        throwsStateError,
      );
    });
  });

  group('ProductSummary column fidelity', () {
    test('description and reorderQuantity survive a server refresh', () async {
      // Regression: both columns existed in the Drift table but were absent
      // from the domain model, so a refresh silently cleared them.
      await products.upsertAll(_scopeA, [
        ProductSummary(
          id: 'p1',
          organizationId: _orgA,
          sku: 'SKU-1',
          name: 'Parle-G 250g',
          status: 'active',
          description: 'Orange juice powder',
          reorderQuantity: const Decimal(24000, scale: 3),
          reorderLevel: const Decimal(6000, scale: 3),
        ),
      ]);

      final row = await products.findById(_scopeA, 'p1');
      expect(row!.description, 'Orange juice powder');
      expect(row.reorderQuantity, const Decimal(24000, scale: 3));
    });

    test('an update preserves the original server createdAt', () async {
      // Regression: upsertAll stamped DateTime.now() on every write, so a
      // product created in March read as the last sync time.
      final createdAt = DateTime.utc(2026, 3, 15);

      await products.upsertAll(_scopeA, [
        ProductSummary(
          id: 'p1',
          organizationId: _orgA,
          sku: 'SKU-1',
          name: 'First name',
          status: 'active',
          createdAt: createdAt,
          updatedAt: createdAt,
        ),
      ]);
      await products.upsertAll(_scopeA, [
        ProductSummary(
          id: 'p1',
          organizationId: _orgA,
          sku: 'SKU-1',
          name: 'Renamed',
          status: 'active',
          createdAt: createdAt,
          updatedAt: createdAt,
        ),
      ]);

      final row = await products.findById(_scopeA, 'p1');
      expect(row!.name, 'Renamed');
      expect(row.createdAt!.isAtSameMomentAs(createdAt), isTrue);
    });

    test('an update does not bleed one row values onto another', () async {
      await products.upsertAll(_scopeA, const [
        ProductSummary(
          id: 'p1',
          organizationId: _orgA,
          sku: 'A',
          name: 'Alpha',
          status: 'active',
          description: 'first',
        ),
        ProductSummary(
          id: 'p2',
          organizationId: _orgA,
          sku: 'B',
          name: 'Beta',
          status: 'active',
          description: 'second',
        ),
      ]);

      final rows = await products.findAll(_scopeA);
      final byId = {for (final r in rows) r.id: r};
      expect(byId['p1']!.name, 'Alpha');
      expect(byId['p1']!.description, 'first');
      expect(byId['p2']!.name, 'Beta');
      expect(byId['p2']!.description, 'second');
    });

    test('an empty batch writes nothing and does not throw', () async {
      await products.upsertAll(_scopeA, const []);
      expect(await products.findAll(_scopeA), isEmpty);
    });
  });

  group('clearAllData', () {
    test('includes unit conversions and leaves the db reusable', () async {
      await catalog.replaceUnitConversions(_scopeA, [
        UnitConversionSummary(
          id: 'conv-1',
          organizationId: _orgA,
          fromUnitId: 'a',
          toUnitId: 'b',
          multiplier: Decimal(1000000, scale: 6),
          createdAt: DateTime.utc(2026, 1, 1),
          updatedAt: DateTime.utc(2026, 1, 1),
        ),
      ]);

      final service = DatabaseService(db);
      await service.clearAllData();

      expect(await catalog.findUnitConversions(_scopeA), isEmpty);
    });
  });
}

final _boundary1 = DateTime.utc(2026, 1, 1);
final _boundary2 = DateTime.utc(2026, 7, 1);
