/// The organization and store a request operates on.
///
/// `AGENTS.md` §13 requires that every business entity belongs to an
/// organization and that operational transactions belong to a store, and that
/// authorization scope is derived server-side. Locally, the equivalent
/// guarantee is that every local read and write is filtered by an explicit
/// [TenantScope] so one organization's rows can never be observed or mutated
/// through another organization's session (BR-040).
///
/// This object is supplied by the authenticated session, never built from
/// user-supplied form data or from values echoed back by an API response.
class TenantScope {
  final String organizationId;

  /// The store this session is operating in, when the operation is
  /// store-scoped. Master-data operations may be organization-wide.
  final String? storeId;

  const TenantScope({required this.organizationId, this.storeId});

  /// Narrows an organization-wide scope to a single store.
  TenantScope forStore(String storeId) =>
      TenantScope(organizationId: organizationId, storeId: storeId);

  /// Throws if this scope is not bound to a store.
  ///
  /// Use this for operations that are meaningless without a store, so the
  /// failure is explicit rather than silently operating organization-wide.
  String get requireStoreId {
    final store = storeId;
    if (store == null) {
      throw StateError('This operation requires a store-scoped TenantScope');
    }
    return store;
  }

  @override
  bool operator ==(Object other) =>
      other is TenantScope &&
      other.organizationId == organizationId &&
      other.storeId == storeId;

  @override
  int get hashCode => Object.hash(organizationId, storeId);

  @override
  String toString() =>
      'TenantScope(organizationId: $organizationId, storeId: $storeId)';
}
