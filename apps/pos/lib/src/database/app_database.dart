import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

import 'decimal.dart';

part 'app_database.g.dart';

/// Organization table matching backend schema
class Organizations extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get legalName => text().nullable()();
  TextColumn get panNumber => text().nullable()();
  TextColumn get vatNumber => text().nullable()();
  TextColumn get contact => text().nullable()();
  TextColumn get address => text().nullable()();
  TextColumn get currency => text()();
  TextColumn get timezone =>
      text().withDefault(const Constant('Asia/Kathmandu'))();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Store table matching backend schema
class Stores extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get name => text()();
  TextColumn get code => text()();
  TextColumn get address => text().nullable()();
  TextColumn get phone => text().nullable()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, code},
  ];
}

/// Register table matching backend schema
class Registers extends Table {
  TextColumn get id => text()();
  TextColumn get storeId => text()();
  TextColumn get name => text()();
  TextColumn get code => text()();
  TextColumn get deviceId => text().nullable()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {storeId, code},
  ];
}

/// User table matching backend schema.
///
/// Credentials are intentionally NOT mirrored here. The backend `User` model
/// carries `passwordHash`; per `brain/SECURITY.md` (Local Security) passwords
/// must never be stored locally, and the POS authenticates against the server.
/// Tokens and device secrets belong in OS secure storage, not SQLite.
class Users extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get name => text()();
  TextColumn get email => text().nullable()();
  TextColumn get phone => text().nullable()();
  DateTimeColumn get lastLogin => dateTime().nullable()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Category table matching backend schema
class Categories extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get parentId => text().nullable()();
  TextColumn get name => text()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, name},
  ];
}

/// Brand table matching backend schema
class Brands extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get name => text()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, name},
  ];
}

/// Unit table matching backend schema
class Units extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  IntColumn get precision => integer().withDefault(const Constant(0))();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, code},
  ];
}

/// TaxCategory table matching backend schema
class TaxCategories extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  IntColumn get rate => integer().map(decimal4)();
  TextColumn get taxType => text()();
  DateTimeColumn get effectiveFrom => dateTime()();
  DateTimeColumn get effectiveTo => dateTime().nullable()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, code},
  ];
}

/// Product table matching backend schema
class Products extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get categoryId => text().nullable()();
  TextColumn get brandId => text().nullable()();
  TextColumn get unitId => text().nullable()();
  TextColumn get taxCategoryId => text().nullable()();
  TextColumn get sku => text()();
  TextColumn get name => text()();
  TextColumn get description => text().nullable()();
  IntColumn get defaultPurchasePrice => integer().map(decimal2).nullable()();
  IntColumn get defaultSellingPrice => integer().map(decimal2).nullable()();
  IntColumn get reorderLevel => integer().map(decimal3).nullable()();
  IntColumn get reorderQuantity => integer().map(decimal3).nullable()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, sku},
  ];
}

/// ProductBarcode table matching backend schema
///
/// Indexed on barcode to mirror the backend `@@index([barcode])`. Barcode
/// lookup is the POS hot path with a sub-100ms target (BRAIN.md Performance
/// Targets) and is answered from this local index, never from the network
/// (brain/OFFLINE_SYNC.md Local Authority).
@TableIndex(name: 'product_barcodes_barcode', columns: {#barcode})
@TableIndex(name: 'product_barcodes_product', columns: {#productId})
class ProductBarcodes extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get productId => text()();
  TextColumn get barcode => text()();
  TextColumn get barcodeType => text().nullable()();
  BoolColumn get isPrimary => boolean().withDefault(const Constant(false))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, barcode},
  ];
}

/// ProductPrice table matching backend schema
///
/// Indexed on (productId, priceType, effectiveFrom) to match the backend
/// `@@index([productId, priceType, effectiveFrom])`. Offline price resolution
/// reads exactly one window per (product, price type) for an instant, so this
/// index is what keeps the POS hot path off a full table scan (BRAIN.md
/// performance targets). Deliberately NOT unique: non-overlap is a server-side
/// rule (ASM-054) enforced in a write transaction, and a local unique index
/// could not express a window overlap anyway.
@TableIndex(
  name: 'product_prices_product_type_from',
  columns: {#productId, #priceType, #effectiveFrom},
)
class ProductPrices extends Table {
  TextColumn get id => text()();
  TextColumn get productId => text()();
  TextColumn get priceType => text()();
  IntColumn get amount => integer().map(decimal2)();
  DateTimeColumn get effectiveFrom => dateTime()();
  DateTimeColumn get effectiveTo => dateTime().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// InventoryLocation table matching backend schema
class InventoryLocations extends Table {
  TextColumn get id => text()();
  TextColumn get storeId => text()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {storeId, code},
  ];
}

/// UnitConversion table matching backend schema.
///
/// Added locally in 05.09 (schemaVersion 2). The backend has had this model
/// since 05.04, but a POS that cannot convert units offline cannot sell a
/// product priced per DOZ while its stock is counted in PCS, so the offline
/// catalog is incomplete without it. Direction is explicit in both rows of a
/// reciprocal pair and is never derived, matching the server.
@TableIndex(
  name: 'unit_conversions_from_to',
  columns: {#fromUnitId, #toUnitId},
)
@TableIndex(name: 'unit_conversions_to_unit', columns: {#toUnitId})
class UnitConversions extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get fromUnitId => text()();
  TextColumn get toUnitId => text()();
  IntColumn get multiplier => integer().map(decimal6)();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, fromUnitId, toUnitId},
  ];
}

/// ProductBatch table matching backend schema
@TableIndex(name: 'batches_product_expiry', columns: {#productId, #expiryDate})
class ProductBatches extends Table {
  TextColumn get id => text()();
  TextColumn get productId => text()();
  TextColumn get batchNumber => text()();
  DateTimeColumn get manufactureDate => dateTime().nullable()();
  DateTimeColumn get expiryDate => dateTime().nullable()();
  IntColumn get unitCost => integer().map(decimal2)();
  TextColumn get supplierId => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {productId, batchNumber},
  ];
}

/// InventoryBalance table matching backend schema
@TableIndex(
  name: 'balances_location_product_batch',
  columns: {#locationId, #productId, #batchId},
)
class InventoryBalances extends Table {
  TextColumn get id => text()();
  TextColumn get locationId => text()();
  TextColumn get productId => text()();
  TextColumn get batchId => text().nullable()();
  IntColumn get quantityOnHand => integer().map(decimal3).withDefault(const Constant(0))();
  IntColumn get reserved => integer().map(decimal3).withDefault(const Constant(0))();
  IntColumn get available => integer().map(decimal3).withDefault(const Constant(0))();
  IntColumn get version => integer().withDefault(const Constant(1))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// InventoryMovement table matching backend schema
///
/// Plain (non-unique) indexes mirror the backend `@@index` declarations.
/// operationId is deliberately NOT unique: a single business operation may fan
/// out to one movement row per product line, and uniqueness is enforced by the
/// operation outbox (SyncOperations) and by the server, not by this table.
@TableIndex(
  name: 'movements_organization_occurred',
  columns: {#organizationId, #occurredAt},
)
@TableIndex(
  name: 'movements_location_product_batch_occurred',
  columns: {#locationId, #productId, #batchId, #occurredAt},
)
@TableIndex(name: 'movements_operation_id', columns: {#operationId})
class InventoryMovements extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get locationId => text()();
  TextColumn get productId => text()();
  TextColumn get batchId => text().nullable()();
  IntColumn get quantity =>
      integer().map(decimal3)(); // Signed: positive = inbound, negative = outbound
  TextColumn get movementType =>
      text()(); // 'receipt', 'sale', 'adjustment', 'transfer_in', 'transfer_out', 'damage', 'expiry'
  IntColumn get unitCost => integer().map(decimal2).nullable()();
  TextColumn get referenceType =>
      text().nullable()(); // 'sale', 'receipt', 'adjustment', 'transfer'
  TextColumn get referenceId => text().nullable()();
  TextColumn get operationId => text().nullable()();
  TextColumn get createdById => text().nullable()();
  DateTimeColumn get occurredAt => dateTime()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Customer table matching backend schema
class Customers extends Table {
  TextColumn get id => text()();
  TextColumn get organizationId => text()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  TextColumn get phone => text().nullable()();
  TextColumn get address => text().nullable()();
  IntColumn get creditLimit => integer().map(decimal2).nullable()();
  TextColumn get status => text().withDefault(const Constant('active'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {organizationId, code},
  ];
}

/// SyncOperation table for offline sync
///
/// This is the client-side operation outbox. `operationId` is unique so a
/// given offline command is enqueued at most once locally (BR-037/BR-038).
@TableIndex(name: 'sync_operations_device_state', columns: {#deviceId, #state})
@TableIndex(name: 'sync_operations_type', columns: {#operationType})
class SyncOperations extends Table {
  TextColumn get id => text()();
  TextColumn get deviceId => text()();
  TextColumn get operationId => text()();
  TextColumn get operationType =>
      text()(); // 'sale', 'receipt', 'adjustment', 'transfer', 'return', 'payment'
  TextColumn get payload => text()(); // JSON payload held locally until synced
  TextColumn get state => text().withDefault(
    const Constant('PENDING'),
  )(); // PENDING, SYNCING, APPLIED, FAILED, RETRY, CONFLICT, MANUAL_RESOLUTION, REJECTED
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
    {operationId},
  ];
}

/// AppDatabase class
@DriftDatabase(
  tables: [
    Organizations,
    Stores,
    Registers,
    Users,
    Categories,
    Brands,
    Units,
    TaxCategories,
    Products,
    ProductBarcodes,
    ProductPrices,
    UnitConversions,
    InventoryLocations,
    ProductBatches,
    InventoryBalances,
    InventoryMovements,
    Customers,
    SyncOperations,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// Constructor for tests: accepts an explicit executor (e.g. an in-memory
  /// `NativeDatabase.memory()`) so tests never touch the on-disk file and each
  /// test gets an isolated database.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) async {
      await m.createAll();
    },
    onUpgrade: (Migrator m, int from, int to) async {
      // Version 1 -> 2 (05.09): add unit_conversions, and add the lookup
      // indexes that offline catalog reads depend on.
      //
      // Each step is additive only. Nothing here drops or rewrites a table,
      // because a POS device may hold unsynced local work and a destructive
      // migration would silently destroy it.
      if (from < 2) {
        await m.createTable(unitConversions);
        // Drift's createAll does not add indexes to tables that already exist,
        // so the new indexes are created explicitly. The generated Index
        // objects are used rather than hand-written SQL, so this list cannot
        // drift out of step with the @TableIndex annotations above.
        await m.createIndex(unitConversionsFromTo);
        await m.createIndex(unitConversionsToUnit);
        await m.createIndex(productBarcodesBarcode);
        await m.createIndex(productBarcodesProduct);
        await m.createIndex(productPricesProductTypeFrom);
      }
    },
  );
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'minimart_pos.sqlite3'));
    return NativeDatabase.createInBackground(file);
  });
}
