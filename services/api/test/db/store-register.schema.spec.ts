import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';
import { randomUUID } from 'node:crypto';

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
  await prisma.register.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

const ORG_BASE = {
  name: 'Store Test Org',
  legalName: 'Store Test Org Pvt Ltd',
  currency: 'NPR',
};

async function createOrg(name = 'Store Test Org') {
  return prisma.organization.create({ data: { ...ORG_BASE, name } });
}

async function createStore(
  organizationId: string,
  overrides: { name?: string; code?: string } = {},
) {
  return prisma.store.create({
    data: {
      organizationId,
      name: overrides.name ?? 'Kathmandu Store',
      code: overrides.code ?? 'KTM-01',
      address: 'New Road',
      phone: '01-5551234',
    },
  });
}

describe('Store schema', () => {
  it('creates a store with documented defaults and scopes it to an organization', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);

    expect(store.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(store.organizationId).toBe(org.id);
    expect(store.name).toBe('Kathmandu Store');
    expect(store.code).toBe('KTM-01');
    expect(store.address).toBe('New Road');
    expect(store.phone).toBe('01-5551234');
    expect(store.status).toBe('active');
  });

  it('enforces unique store code within an organization', async () => {
    const org = await createOrg();
    await createStore(org.id, { code: 'DUP-1' });
    await expect(createStore(org.id, { code: 'DUP-1' })).rejects.toThrow();
  });

  it('allows the same store code in different organizations', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await createStore(orgA.id, { code: 'SHARED' });
    const storeB = await createStore(orgB.id, { code: 'SHARED' });

    expect(storeB.organizationId).toBe(orgB.id);
  });

  it('rejects a store referencing a non-existent organization', async () => {
    await expect(
      prisma.store.create({
        data: {
          organizationId: randomUUID(),
          name: 'Ghost Store',
          code: 'GHOST',
        },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting an organization that still has stores', async () => {
    const org = await createOrg();
    await createStore(org.id);
    await expect(
      prisma.organization.delete({ where: { id: org.id } }),
    ).rejects.toThrow();
  });
});

describe('Register schema', () => {
  it('creates a register with documented defaults and scopes it to a store', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const register = await prisma.register.create({
      data: { storeId: store.id, name: 'Counter 1', code: 'REG-01' },
    });

    expect(register.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(register.storeId).toBe(store.id);
    expect(register.name).toBe('Counter 1');
    expect(register.code).toBe('REG-01');
    expect(register.deviceId).toBeNull();
    expect(register.status).toBe('active');
  });

  it('enforces unique register code within a store', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    await prisma.register.create({
      data: { storeId: store.id, name: 'A', code: 'R-1' },
    });
    await expect(
      prisma.register.create({
        data: { storeId: store.id, name: 'B', code: 'R-1' },
      }),
    ).rejects.toThrow();
  });

  it('allows the same register code in different stores', async () => {
    const org = await createOrg();
    const storeA = await createStore(org.id, { code: 'A-1' });
    const storeB = await createStore(org.id, { code: 'A-2' });
    await prisma.register.create({
      data: { storeId: storeA.id, name: 'A', code: 'SHARED' },
    });
    const regB = await prisma.register.create({
      data: { storeId: storeB.id, name: 'B', code: 'SHARED' },
    });

    expect(regB.storeId).toBe(storeB.id);
  });

  it('rejects a register referencing a non-existent store', async () => {
    await expect(
      prisma.register.create({
        data: { storeId: randomUUID(), name: 'Ghost', code: 'GHOST' },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting a store that still has registers', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    await prisma.register.create({
      data: { storeId: store.id, name: 'R', code: 'R-1' },
    });
    await expect(
      prisma.store.delete({ where: { id: store.id } }),
    ).rejects.toThrow();
  });
});

describe('Store and Register columns', () => {
  async function columnsOf(table: string) {
    return (await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      table,
    )) as Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>;
  }

  it('exposes the documented store columns with correct types', async () => {
    const byName = new Map(
      (await columnsOf('stores')).map((r) => [r.column_name, r]),
    );

    expect(byName.get('id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
    expect(byName.get('organization_id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
    expect(byName.get('name')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.get('code')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.get('address')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(byName.get('phone')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(byName.get('status')).toMatchObject({
      data_type: 'USER-DEFINED',
      udt_name: 'StoreStatus',
      is_nullable: 'NO',
      column_default: '\'active\'::"StoreStatus"',
    });
    expect(byName.get('created_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
    expect(byName.get('updated_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
  });

  it('exposes the documented register columns with correct types', async () => {
    const byName = new Map(
      (await columnsOf('registers')).map((r) => [r.column_name, r]),
    );

    expect(byName.get('id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
    expect(byName.get('store_id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
    expect(byName.get('name')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.get('code')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.get('device_id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'YES',
    });
    expect(byName.get('status')).toMatchObject({
      data_type: 'USER-DEFINED',
      udt_name: 'RegisterStatus',
      is_nullable: 'NO',
      column_default: '\'active\'::"RegisterStatus"',
    });
  });

  it('defines status enums with exactly active/inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname IN ('StoreStatus', 'RegisterStatus')
       ORDER BY t.typname, e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'RegisterStatus', enumlabel: 'active' },
      { typname: 'RegisterStatus', enumlabel: 'inactive' },
      { typname: 'StoreStatus', enumlabel: 'active' },
      { typname: 'StoreStatus', enumlabel: 'inactive' },
    ]);
  });
});

describe('Store and Register constraints', () => {
  async function foreignKeyDeletionType(table: string, column: string) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c.confdeltype::text AS confdeltype
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       WHERE cl.relname = $1 AND c.contype = 'f' AND c.conname = $2`,
      table,
      `${table}_${column}_fkey`,
    )) as Array<{ confdeltype: string }>;
    return rows[0]?.confdeltype;
  }

  it('links stores to organizations with RESTRICT deletion', async () => {
    expect(await foreignKeyDeletionType('stores', 'organization_id')).toBe('r');
  });

  it('links registers to stores with RESTRICT deletion', async () => {
    expect(await foreignKeyDeletionType('registers', 'store_id')).toBe('r');
  });

  it('enforces the unique (organization_id, code) and (store_id, code) indexes', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename IN ('stores', 'registers')
       ORDER BY tablename, indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'registers_device_id_key' },
      { indexname: 'registers_pkey' },
      { indexname: 'registers_store_id_code_key' },
      { indexname: 'stores_organization_id_code_key' },
      { indexname: 'stores_pkey' },
    ]);
  });

  it('declares primary keys on id for both tables', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = ANY(c.conkey)
       WHERE cl.relname IN ('stores', 'registers') AND c.contype = 'p'
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; attname: string }>;

    expect(rows).toEqual([
      { table_name: 'registers', attname: 'id' },
      { table_name: 'stores', attname: 'id' },
    ]);
  });
});
