import 'app_database.dart';

class DatabaseService {
  final AppDatabase _database;

  DatabaseService(this._database);

  AppDatabase get database => _database;

  /// Initialize the database and run migrations
  Future<void> initialize() async {
    // Database is initialized lazily on first access
    // This ensures the database file is created and migrations run
    await _database.customSelect('SELECT 1').get();
  }

  /// Close the database connection
  Future<void> close() async {
    await _database.close();
  }

  /// Clear all data (for testing or logout)
  Future<void> clearAllData() async {
    await _database.transaction(() async {
      await _database.delete(_database.syncOperations).go();
      await _database.delete(_database.inventoryMovements).go();
      await _database.delete(_database.inventoryBalances).go();
      await _database.delete(_database.productBatches).go();
      await _database.delete(_database.inventoryLocations).go();
      await _database.delete(_database.productPrices).go();
      await _database.delete(_database.productBarcodes).go();
      await _database.delete(_database.products).go();
      // Deleted after products, which reference units, so the order mirrors
      // the existing child-before-parent pattern.
      await _database.delete(_database.unitConversions).go();
      await _database.delete(_database.taxCategories).go();
      await _database.delete(_database.units).go();
      await _database.delete(_database.brands).go();
      await _database.delete(_database.categories).go();
      await _database.delete(_database.customers).go();
      await _database.delete(_database.registers).go();
      await _database.delete(_database.stores).go();
      await _database.delete(_database.users).go();
      await _database.delete(_database.organizations).go();
    });
  }

  /// Get database statistics
  Future<DatabaseStats> getStats() async {
    final orgCount = await _database.select(_database.organizations).get();
    final storeCount = await _database.select(_database.stores).get();
    final productCount = await _database.select(_database.products).get();
    final customerCount = await _database.select(_database.customers).get();
    final syncOpCount = await _database.select(_database.syncOperations).get();
    final movementCount = await _database
        .select(_database.inventoryMovements)
        .get();

    return DatabaseStats(
      organizations: orgCount.length,
      stores: storeCount.length,
      products: productCount.length,
      customers: customerCount.length,
      syncOperations: syncOpCount.length,
      inventoryMovements: movementCount.length,
    );
  }
}

/// Database statistics
class DatabaseStats {
  final int organizations;
  final int stores;
  final int products;
  final int customers;
  final int syncOperations;
  final int inventoryMovements;

  const DatabaseStats({
    required this.organizations,
    required this.stores,
    required this.products,
    required this.customers,
    required this.syncOperations,
    required this.inventoryMovements,
  });

  @override
  String toString() {
    return 'DatabaseStats(organizations: $organizations, stores: $stores, '
        'products: $products, customers: $customers, '
        'syncOperations: $syncOperations, inventoryMovements: $inventoryMovements)';
  }
}
