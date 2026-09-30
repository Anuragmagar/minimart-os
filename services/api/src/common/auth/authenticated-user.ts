/**
 * The authenticated principal, as resolved server-side by AuthGuard from the
 * bearer access token. Nothing in this shape is ever taken from the request
 * body, query string or a client-supplied header (AGENTS.md 13).
 */
export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string | null;
  name: string;
  status: string;
  roles: Array<{ id: string; code: string; name: string }>;
  storeAccess: Array<{ id: string; code: string; name: string }>;
  permissions: string[];
}

/**
 * Tenant scope for an application service, derived exclusively from the
 * authenticated principal. `storeId` is only ever a store the principal is
 * already authorized for; services must not accept an organizationId or an
 * unscoped storeId from the caller.
 */
export interface TenantContext {
  organizationId: string;
  userId: string;
  /** One of the store ids the user is authorized for, or null when the
   * operation is not scoped to a single store. */
  storeId: string | null;
  permissions: string[];
}
