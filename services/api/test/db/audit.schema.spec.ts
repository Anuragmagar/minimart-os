import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../src/config/configuration.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import type { AuditRepository } from '../../src/audit/audit.repository.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaService;
let repository: AuditRepository;
let service: AuditService;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const values: Record<keyof AppConfig, unknown> = {
    nodeEnv: 'test',
    port: 4000,
    host: '0.0.0.0',
    databaseUrl: url,
    redisUrl: 'redis://localhost:6379',
    tz: 'Asia/Kathmandu',
    apiPrefix: 'api',
    apiVersion: 'v1',
    logLevel: 'info',
    bodyLimit: '1mb',
    argon2MemoryCost: 19456,
    argon2TimeCost: 2,
    argon2Parallelism: 1,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604800,
    idempotencyTtlSeconds: 86400,
  };
  const configService = {
    getOrThrow: (key: string) => values[key as keyof AppConfig],
  } as ConfigService<AppConfig>;
  prisma = new PrismaService(new AppConfigService(configService));
  await prisma.client.$connect();
  repository = new PrismaAuditRepository(prisma);
  service = new AuditService(repository);
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.client.auditLog.deleteMany({});
  await prisma.client.organization.deleteMany({});
  await prisma.onModuleDestroy();
});

describe('Audit infrastructure integration', () => {
  async function createOrg(): Promise<string> {
    const org = await prisma.client.organization.create({
      data: {
        name: 'Audit Mart',
        legalName: 'Audit Mart Pvt Ltd',
        currency: 'NPR',
      },
    });
    return org.id;
  }

  it('persists a full audit record with before/after JSON', async () => {
    const orgId = await createOrg();
    const created = await service.record({
      organizationId: orgId,
      action: 'update',
      entity: 'Product',
      entityId: 'PRD-1',
      before: { name: 'Milk', price: 100 },
      after: { name: 'Milk', price: 110 },
    });

    const row = await prisma.client.auditLog.findUnique({
      where: { id: created.id },
    });

    expect(row).not.toBeNull();
    expect(row?.organizationId).toBe(orgId);
    expect(row?.action).toBe('update');
    expect(row?.entity).toBe('Product');
    expect(row?.entityId).toBe('PRD-1');
    expect(row?.before).toEqual({ name: 'Milk', price: 100 });
    expect(row?.after).toEqual({ name: 'Milk', price: 110 });
    expect(row?.storeId).toBeNull();
    expect(row?.userId).toBeNull();
    expect(row?.deviceId).toBeNull();
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('accepts a non-UUID entity id and jsonb array/nested data', async () => {
    const orgId = await createOrg();
    const created = await repository.create({
      organizationId: orgId,
      action: 'import',
      entity: 'SalesReceipt',
      entityId: 'SALE-2026-0001',
      before: [{ line: 1 }],
      after: { lines: [{ sku: 'A1', qty: 2 }], total: 50 },
    });

    const row = await prisma.client.auditLog.findUnique({
      where: { id: created.id },
    });

    expect(row?.entityId).toBe('SALE-2026-0001');
    expect(row?.after).toEqual({ lines: [{ sku: 'A1', qty: 2 }], total: 50 });
  });

  it('sanitizes sensitive keys before persisting', async () => {
    const orgId = await createOrg();
    const created = await service.record({
      organizationId: orgId,
      action: 'update',
      entity: 'Customer',
      entityId: 'CUS-1',
      before: { name: 'Ram' },
      after: { name: 'Ram', secret: 'topsecret', cardNumber: '4111' },
    });

    const row = await prisma.client.auditLog.findUnique({
      where: { id: created.id },
    });

    expect(row?.after).toEqual({
      name: 'Ram',
      secret: '[REDACTED]',
      cardNumber: '[REDACTED]',
    });
  });

  it('rolls back the audit record when the enclosing transaction fails', async () => {
    const orgId = await createOrg();
    const beforeCount = await prisma.client.auditLog.count();

    await expect(
      prisma.runInTransaction(async (tx) => {
        await service.record(
          {
            organizationId: orgId,
            action: 'create',
            entity: 'Purchase',
            entityId: 'PO-1',
          },
          tx,
        );
        throw new Error('tx boom');
      }),
    ).rejects.toThrow('tx boom');

    const afterCount = await prisma.client.auditLog.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('keeps the audit record when the enclosing transaction commits', async () => {
    const orgId = await createOrg();
    await prisma.runInTransaction(async (tx) => {
      await service.record(
        {
          organizationId: orgId,
          action: 'create',
          entity: 'Purchase',
          entityId: 'PO-2',
          before: { qty: 0 },
          after: { qty: 10 },
        },
        tx,
      );
    });

    const row = await prisma.client.auditLog.findFirst({
      where: { entityId: 'PO-2' },
    });
    expect(row).not.toBeNull();
  });

  it('exposes only create in the repository (no update/delete)', async () => {
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(repository)),
    ).toEqual(['constructor', 'create']);
  });
});
