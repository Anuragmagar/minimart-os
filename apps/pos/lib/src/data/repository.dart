import 'tenant_scope.dart';

/// Contract for a repository.
///
/// `brain/ARCHITECTURE.md` §Flutter Dependency defines the flow as
/// Presentation → BLoC/Cubit → Use Case → Repository → Local/Remote Data
/// Source. A repository is the boundary a use case talks to. It:
///
/// * decides *which* data source answers a read (local is authoritative while
///   offline, per `brain/OFFLINE_SYNC.md` §Local Authority);
/// * coordinates atomic multi-table writes via `UnitOfWork`;
/// * contains business rules and returns domain values, never storage rows;
/// * never exposes `Dio`, `QueryExecutor`, or Drift row types to callers.
abstract interface class Repository<T> {
  /// Reads a single entity visible to [scope].
  Future<T?> getById(TenantScope scope, String id);

  /// Reads the entities visible to [scope].
  Future<List<T>> getAll(TenantScope scope);
}
