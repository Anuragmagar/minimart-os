import 'package:pos/src/data/data_source.dart';
import 'package:pos/src/data/product_local_data_source.dart';
import 'package:pos/src/data/product_summary.dart';
import 'package:pos/src/data/repository.dart';
import 'package:pos/src/data/tenant_scope.dart';

/// Reference implementation of an offline-first repository.
///
/// Reads always come from the local database, because `brain/OFFLINE_SYNC.md`
/// §Local Authority makes local SQLite authoritative for the current device
/// session. The remote source is used only for an explicit refresh, never to
/// answer a read implicitly, so the UI behaves identically online and offline.
class ProductCatalogRepository implements Repository<ProductSummary> {
  final ProductLocalDataSource _local;
  final RemoteDataSource<ProductSummary>? _remote;

  const ProductCatalogRepository(this._local, {this._remote});

  @override
  Future<ProductSummary?> getById(TenantScope scope, String id) =>
      _local.findById(scope, id);

  @override
  Future<List<ProductSummary>> getAll(TenantScope scope) =>
      _local.findAll(scope);

  /// Locally visible products that are not deactivated.
  Future<List<ProductSummary>> getActive(TenantScope scope) async {
    final all = await getAll(scope);
    return all.where((p) => p.isActive).toList(growable: false);
  }

  /// Looks up a product by its barcode within the scope.
  ///
  /// Barcode lookup is the POS hot path, so it reads the local index rather
  /// than the network. Returns `null` when the barcode is unknown or belongs
  /// to another organization.
  Future<ProductSummary?> findByBarcode(TenantScope scope, String barcode) =>
      _local.findByBarcode(scope, barcode);

  /// Applies a server-authoritative refresh into the local database.
  ///
  /// Returns `false` and does nothing when no remote source is configured, so
  /// an offline device degrades quietly instead of raising.
  Future<bool> refreshFromServer(TenantScope scope) async {
    final remote = _remote;
    if (remote == null) return false;
    final rows = await remote.fetchAll(scope);
    await _local.upsertAll(scope, rows);
    return true;
  }
}
