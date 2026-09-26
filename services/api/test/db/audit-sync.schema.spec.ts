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
  await prisma.conflict.deleteMany({});
  await prisma.syncOperation.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.register.updateMany({ data: { deviceId: null } });
  await prisma.device.deleteMany({});
  await prisma.register.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = `AuditSync Test ${randomUUID()}`) {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createStore(orgId: string, code = `ST-${randomUUID()}`) {
  return prisma.store.create({
    data: { organizationId: orgId, name: `Store ${code}`, code },
  });
}

async function createRegister(storeId: string, code = `REG-${randomUUID()}`) {
  return prisma.register.create({
    data: { storeId, name: `Register ${code}`, code },
  });
}

async function createUser(orgId: string) {
  return prisma.user.create({
    data: {
      organizationId: orgId,
      name: `Auditor ${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
      passwordHash: 'x',
    },
  });
}

async function createDeviceBase() {
  const org = await createOrg();
  const store = await createStore(org.id);
  const register = await createRegister(store.id);
  const user = await createUser(org.id);
  return { org, store, register, user };
}

describe('Device schema', () => {
  it('creates a device scoped to an org/store/register and links register.device_id (ASM-012 closed)', async () => {
    const { org, store, register } = await createDeviceBase();

    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 1',
        deviceType: 'android',
      },
    });
    const linked = await prisma.register.update({
      where: { id: register.id },
      data: { deviceId: device.id },
    });

    expect(device.organizationId).toBe(org.id);
    expect(device.status).toBe('active');
    expect(device.status).toBe('active');
    expect(device.lastOnlineAt).toBeNull();
    expect(linked.deviceId).toBe(device.id);
  });

  it('exposes the register from its device (both directions work)', async () => {
    const { org, store, register } = await createDeviceBase();

    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 2',
        deviceType: 'windows',
      },
    });
    await prisma.register.update({
      where: { id: register.id },
      data: { deviceId: device.id },
    });

    const fetched = await prisma.device.findUniqueOrThrow({
      where: { id: device.id },
      include: { register: true },
    });
    expect(fetched.register.id).toBe(register.id);
  });

  it('allows at most one device per register', async () => {
    const { org, store, register } = await createDeviceBase();
    await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'A',
        deviceType: 'android',
      },
    });

    await expect(
      prisma.device.create({
        data: {
          organizationId: org.id,
          storeId: store.id,
          registerId: register.id,
          name: 'B',
          deviceType: 'windows',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a device referencing a foreign org, store or register', async () => {
    const { store, register } = await createDeviceBase();
    const org = await createOrg();

    await expect(
      prisma.device.create({
        data: {
          organizationId: org.id,
          storeId: randomUUID(),
          registerId: register.id,
          name: 'X',
          deviceType: 'android',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.device.create({
        data: {
          organizationId: org.id,
          storeId: store.id,
          registerId: randomUUID(),
          name: 'Y',
          deviceType: 'android',
        },
      }),
    ).rejects.toThrow();
  });

  it('protects its org, store, register and register device link from deletion', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 3',
        deviceType: 'android',
      },
    });
    await prisma.register.update({
      where: { id: register.id },
      data: { deviceId: device.id },
    });

    await expect(
      prisma.register.delete({ where: { id: register.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.device.delete({ where: { id: device.id } }),
    ).rejects.toThrow();
  });

  it('tracks last online/sync timestamps', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 4',
        deviceType: 'android',
        lastOnlineAt: new Date('2026-09-20T10:00:00.000Z'),
        lastSyncAt: new Date('2026-09-20T10:05:00.000Z'),
      },
    });

    expect(device.lastOnlineAt?.toISOString()).toBe('2026-09-20T10:00:00.000Z');
    expect(device.lastSyncAt?.toISOString()).toBe('2026-09-20T10:05:00.000Z');
  });
});

describe('AuditLog schema', () => {
  it('records an immutable audit entry with before/after JSON', async () => {
    const { org, store, user } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: (await prisma.register.findFirst({
          where: { storeId: store.id },
        }))!.id,
        name: 'POS Terminal 5',
        deviceType: 'android',
      },
    });

    const log = await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        userId: user.id,
        deviceId: device.id,
        action: 'sale.complete',
        entity: 'sale',
        entityId: randomUUID(),
        before: { status: 'pending' },
        after: { status: 'paid', total: 1250.5 },
      },
    });

    expect(log.action).toBe('sale.complete');
    expect(log.entityId).toBeTruthy();
    expect((log.after as { total: number }).total).toBe(1250.5);
    expect((log.before as { status: string }).status).toBe('pending');
    expect(log.createdAt).toBeInstanceOf(Date);
  });

  it('allows organizational/system entries without store, user or device', async () => {
    const org = await createOrg();
    const log = await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        action: 'organization.config_update',
        entity: 'organization',
        entityId: org.id,
        after: { timezone: 'Asia/Kathmandu' },
      },
    });

    expect(log.storeId).toBeNull();
    expect(log.userId).toBeNull();
    expect(log.deviceId).toBeNull();
  });

  it('rejects a log referencing a foreign org, store, user or device', async () => {
    const { org } = await createDeviceBase();

    await expect(
      prisma.auditLog.create({
        data: {
          organizationId: org.id,
          storeId: randomUUID(),
          userId: randomUUID(),
          deviceId: randomUUID(),
          action: 'x',
          entity: 'user',
          entityId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.create({
        data: {
          organizationId: randomUUID(),
          action: 'x',
          entity: 'user',
          entityId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });

  it('protects a device referenced by audit logs from deletion (BR-007)', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 6',
        deviceType: 'android',
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        deviceId: device.id,
        action: 'device.register',
        entity: 'device',
        entityId: device.id,
      },
    });

    await expect(
      prisma.device.delete({ where: { id: device.id } }),
    ).rejects.toThrow();
  });
});

describe('SyncOperation schema', () => {
  it('creates a pending sync operation with documented defaults', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 7',
        deviceType: 'android',
      },
    });

    const op = await prisma.syncOperation.create({
      data: {
        deviceId: device.id,
        operationId: randomUUID(),
        operationType: 'sale.complete',
        payloadRef: `sale:${randomUUID()}`,
      },
    });

    expect(op.state).toBe('PENDING');
    expect(op.attempts).toBe(0);
    expect(op.lastError).toBeNull();
  });

  it('rejects duplicate operation ids so every operation is processed once (BR-038)', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 8',
        deviceType: 'android',
      },
    });
    const operationId = randomUUID();

    await prisma.syncOperation.create({
      data: {
        deviceId: device.id,
        operationId,
        operationType: 'sale.complete',
        payloadRef: 'sale:1',
      },
    });
    await expect(
      prisma.syncOperation.create({
        data: {
          deviceId: device.id,
          operationId,
          operationType: 'sale.complete',
          payloadRef: 'sale:1',
        },
      }),
    ).rejects.toThrow();
  });

  it('moves a sync operation through documented states', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 9',
        deviceType: 'android',
      },
    });

    const op = await prisma.syncOperation.create({
      data: {
        deviceId: device.id,
        operationId: randomUUID(),
        operationType: 'sale.complete',
        payloadRef: 'sale:2',
      },
    });
    await prisma.syncOperation.update({
      where: { id: op.id },
      data: { state: 'SYNCING', attempts: 1 },
    });
    await prisma.syncOperation.update({
      where: { id: op.id },
      data: { state: 'FAILED', lastError: 'network timeout' },
    });
    const retried = await prisma.syncOperation.update({
      where: { id: op.id },
      data: { state: 'RETRY', attempts: 2 },
    });
    const applied = await prisma.syncOperation.update({
      where: { id: op.id },
      data: { state: 'APPLIED', attempts: 3 },
    });

    expect(retried.attempts).toBe(2);
    expect(retried.lastError).toBe('network timeout');
    expect(applied.state).toBe('APPLIED');
  });

  it('rejects a sync operation referencing a foreign device and protects the device', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 10',
        deviceType: 'android',
      },
    });
    const op = await prisma.syncOperation.create({
      data: {
        deviceId: device.id,
        operationId: randomUUID(),
        operationType: 'sale.complete',
        payloadRef: 'sale:3',
      },
    });

    await expect(
      prisma.syncOperation.create({
        data: {
          deviceId: randomUUID(),
          operationId: randomUUID(),
          operationType: 'sale.complete',
          payloadRef: 'sale:4',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.device.delete({ where: { id: device.id } }),
    ).rejects.toThrow();
    expect(op.operationId).toBeTruthy();
  });

  it('types state as text with a PENDING default and attempts as an integer', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name = 'sync_operations' AND column_name IN ('state', 'attempts'))
       ORDER BY column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
      column_default: string | null;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'sync_operations',
        column_name: 'attempts',
        is_nullable: 'NO',
        data_type: 'integer',
        column_default: '0',
      },
      {
        table_name: 'sync_operations',
        column_name: 'state',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: "'PENDING'::text",
      },
    ]);
  });
});

describe('Conflict schema', () => {
  it('records local and server data for a conflict against a sync operation', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 11',
        deviceType: 'android',
      },
    });
    const syncOperation = await prisma.syncOperation.create({
      data: {
        deviceId: device.id,
        operationId: randomUUID(),
        operationType: 'sale.complete',
        payloadRef: 'sale:5',
      },
    });

    const conflict = await prisma.conflict.create({
      data: {
        syncOperationId: syncOperation.id,
        entity: 'product',
        conflictType: 'stock_shortage',
        localData: { quantity: 2 },
        serverData: { quantity: 0 },
      },
    });

    expect(conflict.entity).toBe('product');
    expect((conflict.localData as { quantity: number }).quantity).toBe(2);
    expect((conflict.serverData as { quantity: number }).quantity).toBe(0);
    expect(conflict.resolution).toBeNull();
    expect(conflict.resolvedAt).toBeNull();
  });

  it('allows a user to resolve the conflict (BR-038)', async () => {
    const { org, store, register } = await createDeviceBase();
    const resolver = await createUser(org.id);
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 12',
        deviceType: 'android',
      },
    });
    const syncOperation = await prisma.syncOperation.create({
      data: {
        deviceId: device.id,
        operationId: randomUUID(),
        operationType: 'sale.complete',
        payloadRef: 'sale:6',
      },
    });

    const conflict = await prisma.conflict.create({
      data: {
        syncOperationId: syncOperation.id,
        entity: 'product',
        conflictType: 'price_difference',
        localData: { price: 100 },
        serverData: { price: 95 },
        resolution: 'server_wins',
        resolverId: resolver.id,
        resolvedAt: new Date('2026-09-20T12:00:00.000Z'),
      },
    });

    expect(conflict.resolution).toBe('server_wins');
    expect(conflict.resolverId).toBe(resolver.id);
    expect(conflict.resolvedAt?.toISOString()).toBe('2026-09-20T12:00:00.000Z');
  });

  it('rejects a conflict referencing a foreign sync operation or user', async () => {
    const { org } = await createDeviceBase();
    await createUser(org.id);

    await expect(
      prisma.conflict.create({
        data: {
          syncOperationId: randomUUID(),
          entity: 'product',
          conflictType: 'x',
          localData: {},
          serverData: {},
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.conflict.create({
        data: {
          syncOperationId: randomUUID(),
          entity: 'product',
          conflictType: 'x',
          localData: {},
          serverData: {},
          resolverId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });

  it('allows one conflict per sync operation and protects it from deletion', async () => {
    const { org, store, register } = await createDeviceBase();
    const device = await prisma.device.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        name: 'POS Terminal 13',
        deviceType: 'android',
      },
    });
    const syncOperation = await prisma.syncOperation.create({
      data: {
        deviceId: device.id,
        operationId: randomUUID(),
        operationType: 'sale.complete',
        payloadRef: 'sale:7',
      },
    });
    await prisma.conflict.create({
      data: {
        syncOperationId: syncOperation.id,
        entity: 'product',
        conflictType: 'stock_shortage',
        localData: {},
        serverData: {},
      },
    });

    await expect(
      prisma.conflict.create({
        data: {
          syncOperationId: syncOperation.id,
          entity: 'product',
          conflictType: 'price_difference',
          localData: {},
          serverData: {},
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.syncOperation.delete({ where: { id: syncOperation.id } }),
    ).rejects.toThrow();
  });
});

describe('Audit/sync schema structure', () => {
  it('enforces expected foreign-key deletion actions', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname IN ('audit_logs', 'conflicts', 'devices', 'registers', 'sync_operations')
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      {
        table_name: 'audit_logs',
        column_name: 'device_id',
        on_delete: 'r',
      },
      {
        table_name: 'audit_logs',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      { table_name: 'audit_logs', column_name: 'store_id', on_delete: 'r' },
      { table_name: 'audit_logs', column_name: 'user_id', on_delete: 'r' },
      {
        table_name: 'conflicts',
        column_name: 'resolver_id',
        on_delete: 'r',
      },
      {
        table_name: 'conflicts',
        column_name: 'sync_operation_id',
        on_delete: 'r',
      },
      {
        table_name: 'devices',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      { table_name: 'devices', column_name: 'register_id', on_delete: 'r' },
      { table_name: 'devices', column_name: 'store_id', on_delete: 'r' },
      { table_name: 'registers', column_name: 'device_id', on_delete: 'r' },
      { table_name: 'registers', column_name: 'store_id', on_delete: 'r' },
      {
        table_name: 'sync_operations',
        column_name: 'device_id',
        on_delete: 'r',
      },
    ]);
  });

  it('stores audit and conflict data as jsonb with text identifiers', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'audit_logs' AND column_name IN ('before', 'after', 'entity', 'entity_id'))
           OR (table_name = 'conflicts' AND column_name IN ('local_data', 'server_data', 'conflict_type', 'resolution'))
           OR (table_name = 'devices' AND column_name = 'status')
         )
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'audit_logs',
        column_name: 'after',
        is_nullable: 'YES',
        data_type: 'jsonb',
      },
      {
        table_name: 'audit_logs',
        column_name: 'before',
        is_nullable: 'YES',
        data_type: 'jsonb',
      },
      {
        table_name: 'audit_logs',
        column_name: 'entity',
        is_nullable: 'NO',
        data_type: 'text',
      },
      {
        table_name: 'audit_logs',
        column_name: 'entity_id',
        is_nullable: 'NO',
        data_type: 'text',
      },
      {
        table_name: 'conflicts',
        column_name: 'conflict_type',
        is_nullable: 'NO',
        data_type: 'text',
      },
      {
        table_name: 'conflicts',
        column_name: 'local_data',
        is_nullable: 'NO',
        data_type: 'jsonb',
      },
      {
        table_name: 'conflicts',
        column_name: 'resolution',
        is_nullable: 'YES',
        data_type: 'text',
      },
      {
        table_name: 'conflicts',
        column_name: 'server_data',
        is_nullable: 'NO',
        data_type: 'jsonb',
      },
      {
        table_name: 'devices',
        column_name: 'status',
        is_nullable: 'NO',
        data_type: 'text',
      },
    ]);
  });

  it('defines the expected indexes on audit/sync tables and the register device link', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND (
           tablename IN ('audit_logs', 'conflicts', 'devices', 'registers', 'sync_operations')
           AND indexname NOT LIKE 'registers%'
         )
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'audit_logs_device_id_created_at_idx' },
      { indexname: 'audit_logs_entity_entity_id_idx' },
      { indexname: 'audit_logs_organization_id_created_at_idx' },
      { indexname: 'audit_logs_pkey' },
      { indexname: 'audit_logs_store_id_created_at_idx' },
      { indexname: 'conflicts_conflict_type_idx' },
      { indexname: 'conflicts_entity_idx' },
      { indexname: 'conflicts_pkey' },
      { indexname: 'conflicts_sync_operation_id_key' },
      { indexname: 'devices_organization_id_idx' },
      { indexname: 'devices_pkey' },
      { indexname: 'devices_register_id_key' },
      { indexname: 'devices_store_id_idx' },
      { indexname: 'sync_operations_device_id_state_idx' },
      { indexname: 'sync_operations_operation_id_key' },
      { indexname: 'sync_operations_operation_type_idx' },
      { indexname: 'sync_operations_pkey' },
    ]);
  });

  it('links registers to a single device with a unique index (ASM-012)', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'registers_device_id_key'`,
    )) as Array<{ indexname: string; indexdef: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('USING btree (device_id)');
    expect(rows[0].indexdef).toContain('UNIQUE');
  });
});
