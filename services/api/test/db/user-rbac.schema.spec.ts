import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = 'RBAC Test Org') {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createStore(organizationId: string, code = 'KTM-01') {
  return prisma.store.create({
    data: { organizationId, name: 'Test Store', code },
  });
}

describe('User schema', () => {
  it('creates a user with documented defaults scoped to an organization', async () => {
    const org = await createOrg();
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Cashier One',
        email: 'cashier1@example.com',
        passwordHash: 'argon2hash',
      },
    });

    expect(user.organizationId).toBe(org.id);
    expect(user.name).toBe('Cashier One');
    expect(user.email).toBe('cashier1@example.com');
    expect(user.phone).toBeNull();
    expect(user.passwordHash).toBe('argon2hash');
    expect(user.status).toBe('active');
    expect(user.lastLogin).toBeNull();
  });

  it('enforces globally unique email and phone', async () => {
    const org = await createOrg();
    await prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'A',
        email: 'dup@example.com',
        phone: '9841111111',
        passwordHash: 'h',
      },
    });
    await expect(
      prisma.user.create({
        data: {
          organizationId: org.id,
          name: 'B',
          email: 'dup@example.com',
          passwordHash: 'h',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.user.create({
        data: {
          organizationId: org.id,
          name: 'C',
          phone: '9841111111',
          passwordHash: 'h',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a user referencing a non-existent organization', async () => {
    await expect(
      prisma.user.create({
        data: {
          organizationId: randomUUID(),
          name: 'Ghost',
          passwordHash: 'h',
        },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting an organization that still has users', async () => {
    const org = await createOrg();
    await prisma.user.create({
      data: { organizationId: org.id, name: 'X', passwordHash: 'h' },
    });
    await expect(
      prisma.organization.delete({ where: { id: org.id } }),
    ).rejects.toThrow();
  });
});

describe('Role and Permission schema', () => {
  it('creates a role scoped to an organization with a unique code per org', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.role.create({
      data: { organizationId: orgA.id, name: 'Cashier', code: 'cashier' },
    });
    const roleB = await prisma.role.create({
      data: { organizationId: orgB.id, name: 'Cashier', code: 'cashier' },
    });

    expect(roleB.organizationId).toBe(orgB.id);
    await expect(
      prisma.role.create({
        data: { organizationId: orgA.id, name: 'Cashier 2', code: 'cashier' },
      }),
    ).rejects.toThrow();
  });

  it('enforces a globally unique permission code', async () => {
    await prisma.permission.create({ data: { code: 'products:create' } });
    await expect(
      prisma.permission.create({ data: { code: 'products:create' } }),
    ).rejects.toThrow();
  });

  it('rejects a role referencing a non-existent organization', async () => {
    await expect(
      prisma.role.create({
        data: { organizationId: randomUUID(), name: 'Ghost', code: 'ghost' },
      }),
    ).rejects.toThrow();
  });
});

describe('RBAC junctions', () => {
  it('grants a role to a user with a unique pair', async () => {
    const org = await createOrg();
    const user = await prisma.user.create({
      data: { organizationId: org.id, name: 'U', passwordHash: 'h' },
    });
    const role = await prisma.role.create({
      data: { organizationId: org.id, name: 'R', code: 'r' },
    });

    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    await expect(
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
    ).rejects.toThrow();

    const reloaded = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: true },
    });
    expect(reloaded.roles).toHaveLength(1);
    expect(reloaded.roles[0].roleId).toBe(role.id);
  });

  it('deletes user_roles rows when the role is deleted', async () => {
    const org = await createOrg();
    const user = await prisma.user.create({
      data: { organizationId: org.id, name: 'U', passwordHash: 'h' },
    });
    const role = await prisma.role.create({
      data: { organizationId: org.id, name: 'Temp', code: 'temp' },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });

    await prisma.role.delete({ where: { id: role.id } });

    const remaining = await prisma.userRole.findMany({
      where: { userId: user.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('binds permissions to a role with a unique pair', async () => {
    const org = await createOrg();
    const role = await prisma.role.create({
      data: { organizationId: org.id, name: 'Admin', code: 'admin' },
    });
    const permission = await prisma.permission.create({
      data: { code: 'sales:create' },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
    await expect(
      prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      }),
    ).rejects.toThrow();

    const reloaded = await prisma.role.findUniqueOrThrow({
      where: { id: role.id },
      include: { permissions: true },
    });
    expect(reloaded.permissions).toHaveLength(1);
    expect(reloaded.permissions[0].permissionId).toBe(permission.id);
  });

  it('deletes role_permissions rows when the permission is deleted', async () => {
    const org = await createOrg();
    const role = await prisma.role.create({
      data: { organizationId: org.id, name: 'Pos', code: 'pos' },
    });
    const permission = await prisma.permission.create({
      data: { code: 'sales:void' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });

    await prisma.permission.delete({ where: { id: permission.id } });

    const remaining = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('grants a user store access with a unique pair', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const user = await prisma.user.create({
      data: { organizationId: org.id, name: 'U', passwordHash: 'h' },
    });

    await prisma.userStoreAccess.create({
      data: { userId: user.id, storeId: store.id },
    });
    await expect(
      prisma.userStoreAccess.create({
        data: { userId: user.id, storeId: store.id },
      }),
    ).rejects.toThrow();

    const reloaded = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { storeAccess: true },
    });
    expect(reloaded.storeAccess).toHaveLength(1);
    expect(reloaded.storeAccess[0].storeId).toBe(store.id);
  });

  it('rejects junction rows referencing non-existent parents', async () => {
    const org = await createOrg();
    const role = await prisma.role.create({
      data: { organizationId: org.id, name: 'R', code: 'r2' },
    });
    const permission = await prisma.permission.create({
      data: { code: 'reports:sales' },
    });

    await expect(
      prisma.userRole.create({
        data: { userId: randomUUID(), roleId: role.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.userStoreAccess.create({
        data: { userId: randomUUID(), storeId: permission.id },
      }),
    ).rejects.toThrow();
  });
});

describe('User/RBAC structure', () => {
  it('enforces expected foreign-key deletion actions', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname IN ('users', 'roles', 'user_roles', 'role_permissions', 'user_store_access')
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      {
        table_name: 'role_permissions',
        column_name: 'permission_id',
        on_delete: 'c',
      },
      {
        table_name: 'role_permissions',
        column_name: 'role_id',
        on_delete: 'c',
      },
      { table_name: 'roles', column_name: 'organization_id', on_delete: 'r' },
      { table_name: 'user_roles', column_name: 'role_id', on_delete: 'c' },
      { table_name: 'user_roles', column_name: 'user_id', on_delete: 'c' },
      {
        table_name: 'user_store_access',
        column_name: 'store_id',
        on_delete: 'c',
      },
      {
        table_name: 'user_store_access',
        column_name: 'user_id',
        on_delete: 'c',
      },
      { table_name: 'users', column_name: 'organization_id', on_delete: 'r' },
    ]);
  });

  it('defines the user/rbac status enums with exactly active/inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname IN ('UserStatus', 'RoleStatus', 'PermissionStatus')
       ORDER BY t.typname, e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'PermissionStatus', enumlabel: 'active' },
      { typname: 'PermissionStatus', enumlabel: 'inactive' },
      { typname: 'RoleStatus', enumlabel: 'active' },
      { typname: 'RoleStatus', enumlabel: 'inactive' },
      { typname: 'UserStatus', enumlabel: 'active' },
      { typname: 'UserStatus', enumlabel: 'inactive' },
    ]);
  });

  it('enforces the expected unique indexes', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('permissions', 'roles', 'stores', 'registers', 'users', 'user_roles', 'role_permissions', 'user_store_access')
         AND indexname LIKE '%\\_key' ESCAPE '\\'
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'permissions_code_key' },
      { indexname: 'registers_device_id_key' },
      { indexname: 'registers_store_id_code_key' },
      { indexname: 'role_permissions_role_id_permission_id_key' },
      { indexname: 'roles_organization_id_code_key' },
      { indexname: 'stores_organization_id_code_key' },
      { indexname: 'user_roles_user_id_role_id_key' },
      { indexname: 'user_store_access_user_id_store_id_key' },
      { indexname: 'users_email_key' },
      { indexname: 'users_phone_key' },
    ]);
  });
});
