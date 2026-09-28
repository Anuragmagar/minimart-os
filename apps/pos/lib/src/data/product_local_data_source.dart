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
    for (final item in items) {
      // A row claiming another organization is a server-authority violation;
      // refuse rather than writing it under the caller's scope.
      if (item.organizationId != scope.organizationId) {
        throw StateError(
          'Refusing to write product ${item.id} for organization '
          '${item.organizationId} under $scope',
        );
      }
      await _db
          .into(_db.products)
          .insertOnConflictUpdate(
            ProductsCompanion.insert(
              id: item.id,
              organizationId: item.organizationId,
              sku: item.sku,
              name: item.name,
              status: Value(item.status),
              categoryId: Value(item.categoryId),
              brandId: Value(item.brandId),
              unitId: Value(item.unitId),
              taxCategoryId: Value(item.taxCategoryId),
              defaultPurchasePrice: Value(item.defaultPurchasePrice),
              defaultSellingPrice: Value(item.defaultSellingPrice),
              reorderLevel: Value(item.reorderLevel),
              createdAt: DateTime.now().toUtc(),
              updatedAt: DateTime.now().toUtc(),
            ),
          );
    }
  }

  static ProductSummary _toDomain(Product row) => ProductSummary(
    id: row.id,
    organizationId: row.organizationId,
    sku: row.sku,
    name: row.name,
    status: row.status,
    categoryId: row.categoryId,
    brandId: row.brandId,
    unitId: row.unitId,
    taxCategoryId: row.taxCategoryId,
    defaultPurchasePrice: row.defaultPurchasePrice,
    defaultSellingPrice: row.defaultSellingPrice,
    reorderLevel: row.reorderLevel,
  );
}
