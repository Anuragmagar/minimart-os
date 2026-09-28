import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/database/database_service.dart';
import 'package:pos/src/database/decimal.dart';

import 'setup.dart';

void main() {
  setUpAll(configureTestDrift);

  late AppDatabase db;
  late DatabaseService service;

  Future<int> countRows(TableInfo<Table, dynamic> table) =>
      table.count().getSingle();

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    service = DatabaseService(db);
  });

  tearDown(() async {
    await db.close();
  });

  group('schema', () {
    test('creates all tables and applies migrations', () async {
      await service.initialize();

      final tables = await db
          .customSelect(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
          )
          .get();

      final names = tables.map((r) => r.read<String>('name')).toSet();

      expect(
        names,
        containsAll(<String>[
          'organizations',
          'stores',
          'registers',
          'users',
          'categories',
          'brands',
          'units',
          'tax_categories',
          'products',
          'product_barcodes',
          'product_prices',
          'inventory_locations',
          'product_batches',
          'inventory_balances',
          'inventory_movements',
          'customers',
          'sync_operations',
        ]),
      );
    });

    test('reports the current schema version', () {
      expect(db.schemaVersion, 1);
    });
  });

  group('local credential storage (SECURITY.md - Local Security)', () {
    test('users table has no password column', () async {
      await service.initialize();

      final columns = await db.customSelect('PRAGMA table_info(users)').get();
      final names = columns
          .map((r) => r.read<String>('name'))
          .map((n) => n.toLowerCase());

      expect(names, isNot(contains('passwordhash')));
      expect(names, isNot(contains('password_hash')));
      expect(names, isNot(contains('password')));
    });

    test('no table anywhere stores a password column', () async {
      await service.initialize();

      final tables = await db
          .customSelect(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .get();

      for (final table in tables) {
        final tableName = table.read<String>('name');
        final columns = await db
            .customSelect('PRAGMA table_info($tableName)')
            .get();
        final names = columns
            .map((r) => r.read<String>('name'))
            .map((n) => n.toLowerCase());

        expect(
          names.where((n) => n.contains('password')),
          isEmpty,
          reason: 'table "$tableName" must not store passwords locally',
        );
      }
    });
  });

  group('tenant scoping (BR-040)', () {
    test('duplicate store code is rejected within an organization', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      Future<void> insertOrg(String id) => db
          .into(db.organizations)
          .insert(
            OrganizationsCompanion.insert(
              id: id,
              name: 'Org $id',
              currency: 'NPR',
              createdAt: now,
              updatedAt: now,
            ),
          );

      Future<void> insertStore(String id, String orgId) => db
          .into(db.stores)
          .insert(
            StoresCompanion.insert(
              id: id,
              organizationId: orgId,
              name: 'Store $id',
              code: 'S001',
              createdAt: now,
              updatedAt: now,
            ),
          );

      await insertOrg('org-a');
      await insertStore('store-1', 'org-a');

      await expectLater(
        insertStore('store-2', 'org-a'),
        throwsA(isA<SqliteException>()),
      );

      // Same store code in a different organization is allowed.
      await insertOrg('org-b');
      await insertStore('store-3', 'org-b');

      expect(await countRows(db.stores), 2);
    });
  });

  group('product identity', () {
    test('duplicate sku within an organization is rejected', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      Future<void> insertProduct(String id, String orgId, String sku) => db
          .into(db.products)
          .insert(
            ProductsCompanion.insert(
              id: id,
              organizationId: orgId,
              sku: sku,
              name: 'Product $id',
              createdAt: now,
              updatedAt: now,
            ),
          );

      await insertProduct('p1', 'org-a', 'SKU-1');
      await expectLater(
        insertProduct('p2', 'org-a', 'SKU-1'),
        throwsA(isA<SqliteException>()),
      );

      await insertProduct('p3', 'org-b', 'SKU-1');
      expect(await countRows(db.products), 2);
    });

    test(
      'product can be stored without optional brand/unit/category',
      () async {
        await service.initialize();

        await db
            .into(db.products)
            .insert(
              ProductsCompanion.insert(
                id: 'p-bare',
                organizationId: 'org-a',
                sku: 'SKU-BARE',
                name: 'No brand',
                createdAt: DateTime.utc(2026, 1, 1),
                updatedAt: DateTime.utc(2026, 1, 1),
              ),
            );

        final product = await (db.select(
          db.products,
        )..where((p) => p.id.equals('p-bare'))).getSingle();

        expect(product.brandId, isNull);
        expect(product.unitId, isNull);
        expect(product.categoryId, isNull);
      },
    );

    test('duplicate barcode within an organization is rejected', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      Future<void> insertBarcode(String id, String orgId, String barcode) => db
          .into(db.productBarcodes)
          .insert(
            ProductBarcodesCompanion.insert(
              id: id,
              organizationId: orgId,
              productId: 'p1',
              barcode: barcode,
              createdAt: now,
              updatedAt: now,
            ),
          );

      await insertBarcode('b1', 'org-a', '9801234567890');
      await expectLater(
        insertBarcode('b2', 'org-a', '9801234567890'),
        throwsA(isA<SqliteException>()),
      );
    });
  });

  group('offline operation outbox (BR-037, BR-038)', () {
    test('an operation can only be enqueued once', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      Future<void> enqueue(String id) => db
          .into(db.syncOperations)
          .insert(
            SyncOperationsCompanion.insert(
              id: id,
              deviceId: 'device-1',
              operationId: 'op-123',
              operationType: 'sale',
              payload: '{}',
              createdAt: now,
              updatedAt: now,
            ),
          );

      await enqueue('sync-1');
      await expectLater(enqueue('sync-2'), throwsA(isA<SqliteException>()));

      expect(await countRows(db.syncOperations), 1);
    });

    test('new operations default to PENDING', () async {
      await service.initialize();

      await db
          .into(db.syncOperations)
          .insert(
            SyncOperationsCompanion.insert(
              id: 'sync-1',
              deviceId: 'device-1',
              operationId: 'op-1',
              operationType: 'sale',
              payload: '{}',
              createdAt: DateTime.utc(2026, 1, 1),
              updatedAt: DateTime.utc(2026, 1, 1),
            ),
          );

      final op = await db.select(db.syncOperations).getSingle();
      expect(op.state, 'PENDING');
      expect(op.attempts, 0);
    });

    test('one operation may fan out to multiple inventory movements', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      for (var i = 0; i < 3; i++) {
        await db
            .into(db.inventoryMovements)
            .insert(
              InventoryMovementsCompanion.insert(
                id: 'mv-$i',
                organizationId: 'org-a',
                locationId: 'loc-1',
                productId: 'product-$i',
                movementType: 'sale',
                quantity: const Decimal(-1000, scale: 3),
                operationId: const Value('op-123'),
                occurredAt: now,
                createdAt: now,
              ),
            );
      }

      final movements = await db.select(db.inventoryMovements).get();
      expect(movements, hasLength(3));
      expect(movements.every((m) => m.operationId == 'op-123'), isTrue);
    });
  });

  group('FEFO batch allocation (BR-017)', () {
    test('batches can be ordered by expiry date for FEFO', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      await db
          .into(db.productBatches)
          .insert(
            ProductBatchesCompanion.insert(
              id: 'batch-later',
              productId: 'p1',
              batchNumber: 'B2',
              expiryDate: Value(DateTime.utc(2026, 12, 31)),
              unitCost: const Decimal(10000),
              createdAt: now,
              updatedAt: now,
            ),
          );
      await db
          .into(db.productBatches)
          .insert(
            ProductBatchesCompanion.insert(
              id: 'batch-sooner',
              productId: 'p1',
              batchNumber: 'B1',
              expiryDate: Value(DateTime.utc(2026, 6, 30)),
              unitCost: const Decimal(9000),
              createdAt: now,
              updatedAt: now,
            ),
          );

      final fefo =
          await (db.select(db.productBatches)
                ..where((b) => b.productId.equals('p1'))
                ..orderBy([(b) => OrderingTerm.asc(b.expiryDate)]))
              .get();

      expect(fefo.map((b) => b.batchNumber), ['B1', 'B2']);
    });

    test('duplicate batch number for the same product is rejected', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      Future<void> insertBatch(String id) => db
          .into(db.productBatches)
          .insert(
            ProductBatchesCompanion.insert(
              id: id,
              productId: 'p1',
              batchNumber: 'B1',
              unitCost: const Decimal(10000),
              createdAt: now,
              updatedAt: now,
            ),
          );

      await insertBatch('batch-1');
      await expectLater(
        insertBatch('batch-2'),
        throwsA(isA<SqliteException>()),
      );
    });
  });

  group('inventory invariants', () {
    test('closing balance equals opening plus signed movements', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      const opening = Decimal(50000, scale: 3); // 50.000

      await db
          .into(db.inventoryBalances)
          .insert(
            InventoryBalancesCompanion.insert(
              id: 'bal-1',
              locationId: 'loc-1',
              productId: 'p1',
              quantityOnHand: const Value(opening),
              reserved: const Value(Decimal(0, scale: 3)),
              available: const Value(opening),
              createdAt: now,
              updatedAt: now,
            ),
          );

      final movements = <({String type, Decimal qty})>[
        (type: 'receipt', qty: Decimal(20000, scale: 3)), // +20.000
        (type: 'sale', qty: Decimal(-12500, scale: 3)), // -12.500
        (type: 'adjustment', qty: Decimal(-2500, scale: 3)), // -2.500
      ];

      for (var i = 0; i < movements.length; i++) {
        await db
            .into(db.inventoryMovements)
            .insert(
              InventoryMovementsCompanion.insert(
                id: 'mv-$i',
                organizationId: 'org-a',
                locationId: 'loc-1',
                productId: 'p1',
                movementType: movements[i].type,
                quantity: movements[i].qty,
                occurredAt: now,
                createdAt: now,
              ),
            );
      }

      final allMovements = await db.select(db.inventoryMovements).get();
      var net = Decimal(0, scale: 3);
      for (final m in allMovements) {
        net = net + m.quantity;
      }

      expect(net, const Decimal(5000, scale: 3)); // +5.000
      expect(opening + net, const Decimal(55000, scale: 3)); // 55.000

      final balance = await db.select(db.inventoryBalances).getSingle();

      // The balance row is the opening projection; projecting the movements onto
      // it must reconcile to the same closing figure (BR-005 / BR-006).
      expect(balance.quantityOnHand + net, const Decimal(55000, scale: 3));
      expect(
        balance.quantityOnHand - balance.reserved,
        balance.available,
      );
    });

    test('repeating a fractional receipt does not accumulate float error',
        () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      // 0.1 has no exact binary representation, so 10 additions in float64 do
      // not sum to exactly 1.0. Money and quantity must be exact (AGENTS.md §12).
      var total = Decimal(0, scale: 2);
      for (var i = 0; i < 10; i++) {
        total = total + const Decimal(10); // 0.10 each
      }

      expect(total, const Decimal(100)); // exactly 1.00

      var floatTotal = 0.0;
      for (var i = 0; i < 10; i++) {
        floatTotal += 0.1;
      }
      expect(floatTotal == 1.0, isFalse,
          reason: 'documents why Decimal replaces float64');

      await db.into(db.productBatches).insert(
            ProductBatchesCompanion.insert(
              id: 'batch-1',
              productId: 'p1',
              batchNumber: 'B1',
              unitCost: total,
              createdAt: now,
              updatedAt: now,
            ),
          );

      final batch = await db.select(db.productBatches).getSingle();
      expect(batch.unitCost, const Decimal(100));
      expect(batch.unitCost.toDouble(), 1.0);
    });
  });

  group('DatabaseService', () {
    test('initialize is idempotent', () async {
      await service.initialize();
      await service.initialize();
      expect(await countRows(db.organizations), 0);
    });

    test('getStats reports row counts', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      await db
          .into(db.organizations)
          .insert(
            OrganizationsCompanion.insert(
              id: 'org-a',
              name: 'Org A',
              currency: 'NPR',
              createdAt: now,
              updatedAt: now,
            ),
          );
      await db
          .into(db.stores)
          .insert(
            StoresCompanion.insert(
              id: 'store-a',
              organizationId: 'org-a',
              name: 'Store A',
              code: 'S001',
              createdAt: now,
              updatedAt: now,
            ),
          );
      await db
          .into(db.products)
          .insert(
            ProductsCompanion.insert(
              id: 'p1',
              organizationId: 'org-a',
              sku: 'SKU-1',
              name: 'Product 1',
              createdAt: now,
              updatedAt: now,
            ),
          );

      final stats = await service.getStats();
      expect(stats.organizations, 1);
      expect(stats.stores, 1);
      expect(stats.products, 1);
      expect(stats.customers, 0);
      expect(stats.syncOperations, 0);
      expect(stats.inventoryMovements, 0);
    });

    test('clearAllData empties every table', () async {
      await service.initialize();
      final now = DateTime.utc(2026, 1, 1);

      await db
          .into(db.organizations)
          .insert(
            OrganizationsCompanion.insert(
              id: 'org-a',
              name: 'Org A',
              currency: 'NPR',
              createdAt: now,
              updatedAt: now,
            ),
          );
      await db
          .into(db.products)
          .insert(
            ProductsCompanion.insert(
              id: 'p1',
              organizationId: 'org-a',
              sku: 'SKU-1',
              name: 'Product 1',
              createdAt: now,
              updatedAt: now,
            ),
          );

      await service.clearAllData();

      expect(await countRows(db.products), 0);
      expect(await countRows(db.organizations), 0);
    });
  });
}
