import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/database/decimal.dart';
import 'package:pos/src/data/data_source.dart';
import 'package:pos/src/data/product_catalog_repository.dart';
import 'package:pos/src/data/product_local_data_source.dart';
import 'package:pos/src/data/product_summary.dart';
import 'package:pos/src/data/tenant_scope.dart';
import 'package:pos/src/data/unit_of_work.dart';

import '../setup.dart';

const _orgA = 'org-a';
const _orgB = 'org-b';

void main() {
  setUpAll(configureTestDrift);

  late AppDatabase db;
  late ProductLocalDataSource local;
  late ProductCatalogRepository repository;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    local = ProductLocalDataSource(db);
    repository = ProductCatalogRepository(local);
  });

  tearDown(() => db.close());

  Future<void> seedProduct({
    required String org,
    String id = 'p1',
    String sku = 'SKU-1',
    String name = 'Parle-G 250g',
    String status = 'active',
    String? barcode,
  }) async {
    await db
        .into(db.products)
        .insert(
          ProductsCompanion.insert(
            id: id,
            organizationId: org,
            sku: sku,
            name: name,
            status: Value(status),
            defaultSellingPrice: const Value(Decimal(35, scale: 2)),
            createdAt: DateTime.now().toUtc(),
            updatedAt: DateTime.now().toUtc(),
          ),
        );
    if (barcode != null) {
      await db
          .into(db.productBarcodes)
          .insert(
            ProductBarcodesCompanion.insert(
              id: 'bc-$id',
              organizationId: org,
              productId: id,
              barcode: barcode,
              createdAt: DateTime.now().toUtc(),
              updatedAt: DateTime.now().toUtc(),
            ),
          );
    }
  }

  group('TenantScope', () {
    test('organization-wide scope exposes no store', () {
      const scope = TenantScope(organizationId: _orgA);
      expect(scope.storeId, isNull);
    });

    test('forStore narrows the scope', () {
      const scope = TenantScope(organizationId: _orgA);
      final scoped = scope.forStore('store-1');
      expect(scoped.organizationId, _orgA);
      expect(scoped.storeId, 'store-1');
      expect(scoped, isNot(scope));
    });

    test('requireStoreId throws for organization-wide scope', () {
      const scope = TenantScope(organizationId: _orgA);
      expect(() => scope.requireStoreId, throwsStateError);
    });

    test('requireStoreId returns the store when bound', () {
      const scope = TenantScope(organizationId: _orgA, storeId: 'store-1');
      expect(scope.requireStoreId, 'store-1');
    });
  });

  group('ProductCatalogRepository tenant isolation', () {
    test('getAll returns only the scoped organization rows', () async {
      await seedProduct(org: _orgA, id: 'a1', sku: 'A-1');
      await seedProduct(org: _orgB, id: 'b1', sku: 'B-1');

      final rows = await repository.getAll(
        const TenantScope(organizationId: _orgA),
      );

      expect(rows.map((p) => p.id), ['a1']);
    });

    test('getById cannot read another organization product', () async {
      await seedProduct(org: _orgB, id: 'b1', sku: 'B-1');

      final result = await repository.getById(
        const TenantScope(organizationId: _orgA),
        'b1',
      );

      expect(result, isNull);
    });

    test(
      'barcode lookup cannot resolve another organization product',
      () async {
        await seedProduct(org: _orgB, id: 'b1', barcode: '9800000000017');

        final result = await repository.findByBarcode(
          const TenantScope(organizationId: _orgA),
          '9800000000017',
        );

        expect(result, isNull);
      },
    );
  });

  group('ProductCatalogRepository reads', () {
    test('getActive excludes deactivated products', () async {
      await seedProduct(org: _orgA, id: 'a1', sku: 'A-1');
      await seedProduct(
        org: _orgA,
        id: 'a2',
        sku: 'A-2',
        name: 'Old stock',
        status: 'inactive',
      );

      final rows = await repository.getActive(
        const TenantScope(organizationId: _orgA),
      );

      expect(rows.map((p) => p.id), ['a1']);
    });

    test(
      'barcode lookup resolves a product in the same organization',
      () async {
        await seedProduct(org: _orgA, id: 'a1', barcode: '9800000000017');

        final result = await repository.findByBarcode(
          const TenantScope(organizationId: _orgA),
          '9800000000017',
        );

        expect(result, isNotNull);
        expect(result!.id, 'a1');
      },
    );

    test('unknown barcode returns null', () async {
      final result = await repository.findByBarcode(
        const TenantScope(organizationId: _orgA),
        'does-not-exist',
      );
      expect(result, isNull);
    });

    test('decimal selling price survives the repository round trip', () async {
      await seedProduct(org: _orgA, id: 'a1');

      final result = await repository.getById(
        const TenantScope(organizationId: _orgA),
        'a1',
      );

      expect(result!.defaultSellingPrice, const Decimal(35, scale: 2));
    });
  });

  group('refreshFromServer', () {
    test('reports false and writes nothing without a remote source', () async {
      final applied = await repository.refreshFromServer(
        const TenantScope(organizationId: _orgA),
      );
      expect(applied, isFalse);
    });

    test('applies server-authoritative rows locally', () async {
      final remote = _FakeRemoteDataSource([
        ProductSummary(
          id: 'srv-1',
          organizationId: _orgA,
          sku: 'SRV-1',
          name: 'Server product',
          status: 'active',
        ),
      ]);
      final withRemote = ProductCatalogRepository(local, remote: remote);

      final applied = await withRemote.refreshFromServer(
        const TenantScope(organizationId: _orgA),
      );

      expect(applied, isTrue);
      final rows = await withRemote.getAll(
        const TenantScope(organizationId: _orgA),
      );
      expect(rows.single.id, 'srv-1');
    });

    test('refuses a row belonging to another organization', () async {
      final remote = _FakeRemoteDataSource([
        ProductSummary(
          id: 'srv-x',
          organizationId: _orgB,
          sku: 'X-1',
          name: 'Foreign',
          status: 'active',
        ),
      ]);
      final withRemote = ProductCatalogRepository(local, remote: remote);

      await expectLater(
        withRemote.refreshFromServer(const TenantScope(organizationId: _orgA)),
        throwsStateError,
      );
    });
  });

  group('upsertAll', () {
    test('inserts then updates in place', () async {
      const scope = TenantScope(organizationId: _orgA);

      await local.upsertAll(scope, [
        const ProductSummary(
          id: 'p9',
          organizationId: _orgA,
          sku: 'S-9',
          name: 'First',
          status: 'active',
        ),
      ]);
      await local.upsertAll(scope, [
        const ProductSummary(
          id: 'p9',
          organizationId: _orgA,
          sku: 'S-9',
          name: 'Renamed',
          status: 'active',
        ),
      ]);

      final rows = await local.findAll(scope);
      expect(rows, hasLength(1));
      expect(rows.single.name, 'Renamed');
    });
  });

  group('UnitOfWork', () {
    test('commits every write when the action succeeds', () async {
      final uow = UnitOfWork(db);
      const scope = TenantScope(organizationId: _orgA);

      await uow.run(() async {
        await seedProduct(org: _orgA, id: 'u1', sku: 'U-1');
        await seedProduct(org: _orgA, id: 'u2', sku: 'U-2');
      });

      expect(await local.findAll(scope), hasLength(2));
    });

    test('rolls back every write when the action throws', () async {
      final uow = UnitOfWork(db);
      const scope = TenantScope(organizationId: _orgA);

      await expectLater(
        uow.run(() async {
          await seedProduct(org: _orgA, id: 'u1', sku: 'U-1');
          throw StateError('failure midway');
        }),
        throwsStateError,
      );

      expect(await local.findAll(scope), isEmpty);
    });
  });
}

class _FakeRemoteDataSource implements RemoteDataSource<ProductSummary> {
  final List<ProductSummary> rows;

  _FakeRemoteDataSource(this.rows);

  @override
  Future<List<ProductSummary>> fetchAll(TenantScope scope) async => rows;

  @override
  Future<void> push(
    TenantScope scope,
    ProductSummary item, {
    required String operationId,
  }) async {}
}
