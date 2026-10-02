import 'package:drift/drift.dart';

import 'package:pos/src/database/app_database.dart';
import 'package:pos/src/data/data_source.dart';
import 'package:pos/src/data/product_summary.dart';
import 'package:pos/src/data/tenant_scope.dart';

/// Local (SQLite) data source for the product catalog.
///
/// Reference implementation of the [LocalDataSource] convention.
class ProductLocalDataSource implements LocalDataSource<ProductSummary> {
  final AppDatabase _db;

  const ProductLocalDataSource(this._db);

  @override
  Future<List<ProductSummary>> findAll(TenantScope scope) async {
    final rows = await (_db.select(
      _db.products,
    )..where((p) => p.organizationId.equals(scope.organizationId))).get();
    return rows.map(_toDomain).toList(growable: false);
  }

  /// Resolves a barcode to a product visible to [scope].
  ///
  /// Kept here rather than in the repository so the repository never touches
  /// Drift tables directly.
  Future<ProductSummary?> findByBarcode(
    TenantScope scope,
    String barcode,
  ) async {
    final match =
        await (_db.select(_db.productBarcodes)..where(
              (b) =>
                  b.barcode.equals(barcode) &
                  b.organizationId.equals(scope.organizationId),
            ))
            .getSingleOrNull();
    if (match == null) return null;
    return findById(scope, match.productId);
  }

  @override
  Future<ProductSummary?> findById(TenantScope scope, String id) async {
    // Filtering by organizationId in the same query as the id is what prevents
    // a cross-organization read (BR-040). Filtering only by id would let one
    // organization fetch another organization's product.
    final row =
        await (_db.select(_db.products)..where(
              (p) =>
                  p.id.equals(id) &
                  p.organizationId.equals(scope.organizationId),
            ))
            .getSingleOrNull();
    return row == null ? null : _toDomain(row);
  }

  @override
  Future<void> upsertAll(TenantScope scope, List<ProductSummary> items) async {
    if (items.isEmpty) return;

    // Validate the whole batch before writing anything, so a single foreign
    // row cannot leave a half-applied refresh on disk.
    for (final item in items) {
      // A row claiming another organization is a server-authority violation;
      // refuse rather than writing it under the caller's scope.
      if (item.organizationId != scope.organizationId) {
        throw StateError(
          'Refusing to write product ${item.id} for organization '
          '${item.organizationId} under $scope',
        );
      }
    }

    final now = DateTime.now().toUtc();

    await _db.transaction(() async {
      // Two statements rather than a single insertOnConflictUpdate, because
      // that helper rewrites every column on conflict and would overwrite
      // createdAt with a local clock reading. createdAt is server history: a
      // product created in March must still read as March on this device, not
      // as whenever the device last happened to sync.
      //
      // Insert-only first, so new rows land with their real server values and
      // existing rows are then updated field by field below.
      await _db.batch((batch) {
        batch.insertAll(
          _db.products,
          [
            for (final item in items)
              ProductsCompanion.insert(
                id: item.id,
                organizationId: item.organizationId,
                sku: item.sku,
                name: item.name,
                description: Value(item.description),
                status: Value(item.status),
                categoryId: Value(item.categoryId),
                brandId: Value(item.brandId),
                unitId: Value(item.unitId),
                taxCategoryId: Value(item.taxCategoryId),
                defaultPurchasePrice: Value(item.defaultPurchasePrice),
                defaultSellingPrice: Value(item.defaultSellingPrice),
                reorderLevel: Value(item.reorderLevel),
                reorderQuantity: Value(item.reorderQuantity),
                createdAt: item.createdAt ?? now,
                updatedAt: item.updatedAt ?? now,
              ),
          ],
          mode: InsertMode.insertOrIgnore,
        );
      });

      // Per-row update so each row keeps its own field values. createdAt is
      // absent from the companion on purpose: it is not mutable locally.
      for (final item in items) {
        await (_db.update(_db.products)..where((p) => p.id.equals(item.id)))
            .write(
              ProductsCompanion(
                sku: Value(item.sku),
                name: Value(item.name),
                description: Value(item.description),
                status: Value(item.status),
                categoryId: Value(item.categoryId),
                brandId: Value(item.brandId),
                unitId: Value(item.unitId),
                taxCategoryId: Value(item.taxCategoryId),
                defaultPurchasePrice: Value(item.defaultPurchasePrice),
                defaultSellingPrice: Value(item.defaultSellingPrice),
                reorderLevel: Value(item.reorderLevel),
                reorderQuantity: Value(item.reorderQuantity),
                updatedAt: Value(item.updatedAt ?? now),
              ),
            );
      }
    });
  }

  static ProductSummary _toDomain(Product row) => ProductSummary(
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
}
