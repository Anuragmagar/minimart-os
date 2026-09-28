import 'tenant_scope.dart';

/// Contract for a local (Drift/SQLite) data source.
///
/// Conventions enforced by this interface:
///
/// * Every method takes a [TenantScope] and must filter by it. A data source
///   that can read across organizations is a tenant-isolation defect (BR-040).
/// * Data sources translate storage failures into the application error model
///   and contain no business rules. Decision-making belongs in repositories.
/// * Money and quantity are exposed as `Decimal`, never `double`, so precision
///   survives the round trip (`AGENTS.md` §12).
/// * Data sources never enqueue sync operations and never talk to the network.
abstract interface class LocalDataSource<T> {
  /// Rows visible to [scope].
  Future<List<T>> findAll(TenantScope scope);

  /// A single row by primary key, or `null` when absent or out of scope.
  Future<T?> findById(TenantScope scope, String id);

  /// Inserts or updates rows received from the server.
  ///
  /// Intended for server-authoritative pull. Must not delete rows that are
  /// absent from [items]; removal is a separate, explicit operation.
  Future<void> upsertAll(TenantScope scope, List<T> items);
}

/// Contract for a remote (Dio/HTTP) data source.
///
/// Data sources are thin: they translate a domain request into an API call and
/// the API envelope back into plain data or an [AppException]. They contain no
/// business rules, no caching policy, and no local writes.
abstract interface class RemoteDataSource<T> {
  /// Fetches rows for [scope] from the server.
  Future<List<T>> fetchAll(TenantScope scope);

  /// Pushes a locally originated mutation to the server.
  ///
  /// `operationId` is supplied by the caller so that the server can apply the
  /// idempotency rule (BR-037/BR-038) and so retrying the same command cannot
  /// create a duplicate transaction (`AGENTS.md` §22). Operation identity
  /// generation itself belongs to the offline sync workstream, so this contract
  /// only requires that the value is present and passed through.
  Future<void> push(TenantScope scope, T item, {required String operationId});
}
