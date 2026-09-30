/**
 * The permission catalog, exactly as documented in brain/SECURITY.md.
 *
 * This list is the whole catalog. A new permission code is a business-rule
 * change: it must be added to brain/SECURITY.md, the seed, and this file in the
 * same reviewed change. Guards may only require codes that appear here.
 */
export const PERMISSION_CODES = [
  'products:create',
  'products:update',
  'products:deactivate',
  'sales:create',
  'sales:return',
  'sales:void',
  'inventory:view',
  'inventory:adjust',
  'inventory:transfer',
  'purchasing:create',
  'purchasing:receive',
  'customers:view',
  'customers:credit',
  'reports:sales',
  'reports:profit',
  'cash:open',
  'cash:close',
  'cash:withdraw',
  'users:manage',
  'roles:manage',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/**
 * Named aliases for the codes guards actually require, so a route never carries
 * a hand-typed permission string that could drift from the catalog.
 */
export const PERMISSION = {
  usersManage: 'users:manage',
  rolesManage: 'roles:manage',
} as const satisfies Record<string, PermissionCode>;

export function isKnownPermissionCode(code: string): code is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(code);
}
