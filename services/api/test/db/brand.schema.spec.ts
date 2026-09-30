import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../src/config/configuration.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import type { BrandRepository } from '../../src/brands/brand.repository.js';
import { PrismaBrandRepository } from '../../src/brands/prisma-brand.repository.js';
import { BrandService } from '../../src/brands/brand.service.js';
import type { AuditRepository } from '../../src/audit/audit.repository.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import type { TenantContext } from '../../src/common/auth/authenticated-user.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaService;
let repository: BrandRepository;

const ORG_A = 'a0000000-0000-4000-8000-000000000001';
const ORG_B = 'b0000000-0000-4000-8000-000000000002';
const USER = 'c0000000-0000-4000-8000-000000000003';
const CATEGORY = 'd0000000-0000-4000-8000-000000000004';
const UNIT = 'e0000000-0000-4000-8000-000000000005';

const ctxA: TenantContext = {
  organizationId: ORG_A,
  userId: USER,
  storeId: null,
  permissions: ['products:manage'],
};
const ctxB: TenantContext = { ...ctxA, organizationId: ORG_B };

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
  repository = new PrismaBrandRepository(prisma);
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.client.auditLog.deleteMany({});
  await prisma.client.product.deleteMany({});
  await prisma.client.brand.deleteMany({});
  await prisma.client.unit.deleteMany({});
  await prisma.client.category.deleteMany({});
  await prisma.client.user.deleteMany({});
  await prisma.client.organization.deleteMany({});
  await prisma.onModuleDestroy();
});

beforeEach(async () => {
  await prisma.client.auditLog.deleteMany({});
  await prisma.client.product.deleteMany({});
  await prisma.client.brand.deleteMany({});
  await prisma.client.unit.deleteMany({});
  await prisma.client.category.deleteMany({});
  await prisma.client.user.deleteMany({});
  await prisma.client.organization.deleteMany({});

  await prisma.client.organization.createMany({
    data: [
      {
        id: ORG_A,
        name: 'Brand Mart A',
        legalName: 'Brand Mart A Pvt Ltd',
        currency: 'NPR',
      },
      {
        id: ORG_B,
        name: 'Brand Mart B',
        legalName: 'Brand Mart B Pvt Ltd',
        currency: 'NPR',
      },
    ],
  });

  await prisma.client.user.create({
    data: {
      id: USER,
      organizationId: ORG_A,
      name: 'Brand Manager',
      email: 'brand.manager@minimart.local',
      passwordHash: 'test-hash-not-a-real-credential',
    },
  });

  await prisma.client.category.create({
    data: { id: CATEGORY, organizationId: ORG_A, name: 'Beverages' },
  });
  await prisma.client.unit.create({
    data: {
      id: UNIT,
      organizationId: ORG_A,
      name: 'Pieces',
      code: 'PCS',
      precision: 0,
    },
  });
});

/** Collects audit entries instead of persisting them, so no rows leak. */
function createService(): BrandService {
  const auditRepository = {
    create: (entry: unknown) =>
      Promise.resolve({ id: 'audit', ...(entry as object) }),
  } as unknown as AuditRepository;
  const audit = { record: (entry: unknown) => auditRepository.create(entry) };
  return new BrandService(repository, prisma, audit as never);
}

/**
 * Uses the real audit stack so the transaction and the persisted row are both
 * exercised against PostgreSQL.
 */
function createServiceWithRealAudit(): BrandService {
  const audit = new AuditService(new PrismaAuditRepository(prisma));
  return new BrandService(repository, prisma, audit);
}

/** Attaches a product to a brand so the delete guard has something to protect. */
async function attachProductTo(brandId: string): Promise<string> {
  const product = await prisma.client.product.create({
    data: {
      organizationId: ORG_A,
      name: 'Orange Juice 1L',
      sku: 'BRAND-TEST-1',
      categoryId: CATEGORY,
      brandId,
      unitId: UNIT,
    },
  });
  return product.id;
}

describe('brand management (database integration)', () => {
  it('stores a brand as active', async () => {
    const created = (await createService().create(ctxA, {
      name: 'Everest Foods',
    })) as { status: string; organizationId: string };

    expect(created.status).toBe('active');
    expect(created.organizationId).toBe(ORG_A);
  });

  it('enforces the database unique name per organization', async () => {
    await createService().create(ctxA, { name: 'Everest Foods' });

    await expect(
      prisma.client.brand.create({
        data: { organizationId: ORG_A, name: 'Everest Foods' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows the same brand name in a different organization', async () => {
    await createService().create(ctxA, { name: 'Everest Foods' });
    await createService().create(ctxB, { name: 'Everest Foods' });

    const a = await repository.findByName('Everest Foods', ORG_A);
    const b = await repository.findByName('Everest Foods', ORG_B);

    expect(a?.organizationId).toBe(ORG_A);
    expect(b?.organizationId).toBe(ORG_B);
  });

  it('does not return another organization brand by id', async () => {
    const created = (await createService().create(ctxB, {
      name: 'Foreign',
    })) as { id: string };

    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).toBeNull();
  });

  it('rejects a duplicate name through the service', async () => {
    await createService().create(ctxA, { name: 'Everest Foods' });

    await expect(
      createService().create(ctxA, { name: 'Everest Foods' }),
    ).rejects.toThrow(/already exists/);
  });

  it('paginates and counts within the organization', async () => {
    const service = createService();
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await service.create(ctxA, { name });
    }
    await service.create(ctxB, { name: 'Delta' });

    const page = (await service.findAll(ctxA, { page: 1, limit: 2 })) as {
      data: Array<{ name: string }>;
      total: number;
      limit: number;
    };

    // The organization total excludes the other tenant's brand.
    expect(page.total).toBe(3);
    expect(page.limit).toBe(2);
    expect(page.data).toHaveLength(2);
    // Default ordering is createdAt descending, so the two newest come first.
    expect(page.data.map((row) => row.name).sort()).toEqual(['Beta', 'Gamma']);
  });

  it('filters the list by name and by status', async () => {
    const service = createService();
    const target = (await service.create(ctxA, {
      name: 'Himalaya Dairy',
    })) as { id: string };
    await service.create(ctxA, { name: 'City Fresh' });
    await service.update(ctxA, target.id, { status: 'inactive' });

    const byName = (await service.findAll(ctxA, { search: 'himal' })) as {
      data: Array<{ name: string }>;
    };
    expect(byName.data.map((row) => row.name)).toEqual(['Himalaya Dairy']);

    const active = (await service.findAll(ctxA, { status: 'active' })) as {
      data: Array<{ name: string }>;
    };
    expect(active.data.map((row) => row.name)).toEqual(['City Fresh']);
  });

  it('deactivates a brand without deleting it', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'Everest Foods',
    })) as { id: string };

    const updated = (await service.deactivate(ctxA, created.id)) as {
      status: string;
    };

    expect(updated.status).toBe('inactive');
    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).not.toBeNull();
  });

  it('refuses to delete a brand that a product still references', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'City Fresh',
    })) as { id: string };
    await attachProductTo(created.id);

    await expect(service.delete(ctxA, created.id)).rejects.toThrow(
      /still referenced/,
    );
    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).not.toBeNull();
  });

  it('would reject the delete at the database level without the guard', async () => {
    // Documents that products.brand_id is RESTRICT, so the reference count in
    // the service exists to turn a raw foreign-key error into a clear message.
    const brand = await prisma.client.brand.create({
      data: { organizationId: ORG_A, name: 'Restrict Proof' },
    });
    await attachProductTo(brand.id);

    await expect(
      prisma.client.brand.delete({ where: { id: brand.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('deletes an unreferenced brand', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'Everest Foods',
    })) as { id: string };

    await service.delete(ctxA, created.id);

    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).toBeNull();
  });

  it('allows a brand to be deleted once its product is gone', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'City Fresh',
    })) as { id: string };
    const productId = await attachProductTo(created.id);

    await prisma.client.product.delete({ where: { id: productId } });
    await service.delete(ctxA, created.id);

    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).toBeNull();
  });

  it('refuses to delete a brand in another organization', async () => {
    const foreign = (await createService().create(ctxB, {
      name: 'Foreign',
    })) as { id: string };

    await expect(createService().delete(ctxA, foreign.id)).rejects.toThrow(
      /not found/i,
    );
    expect(
      await repository.findByIdInOrganization(foreign.id, ORG_B),
    ).not.toBeNull();
  });

  it('allows a deactivated brand to still back its products', async () => {
    // Deactivation is the soft path precisely so product history survives.
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'City Fresh',
    })) as { id: string };
    const productId = await attachProductTo(created.id);

    await service.deactivate(ctxA, created.id);

    const product = await prisma.client.product.findUnique({
      where: { id: productId },
    });
    expect(product?.brandId).toBe(created.id);
  });

  it('writes an audit record in the business transaction', async () => {
    const service = createServiceWithRealAudit();

    const created = (await service.create(ctxA, {
      name: 'Everest Foods',
    })) as { id: string };

    const entries = await prisma.client.auditLog.findMany({
      where: { entity: 'Brand', entityId: created.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('brand.create');
    expect(entries[0].userId).toBe(USER);
    expect(entries[0].organizationId).toBe(ORG_A);
  });

  it('records the before and after state of an update', async () => {
    const service = createServiceWithRealAudit();
    const created = (await service.create(ctxA, {
      name: 'Everest Foods',
    })) as { id: string };

    await service.update(ctxA, created.id, { name: 'Everest Group' });

    const entry = await prisma.client.auditLog.findFirst({
      where: { entity: 'Brand', entityId: created.id, action: 'brand.update' },
    });
    expect(entry?.before).toMatchObject({ name: 'Everest Foods' });
    expect(entry?.after).toMatchObject({ name: 'Everest Group' });
  });

  it('rolls back the brand when the audit write fails', async () => {
    const service = new BrandService(repository, prisma, {
      record: () => Promise.reject(new Error('audit unavailable')),
    } as never);

    await expect(service.create(ctxA, { name: 'Rolled Back' })).rejects.toThrow(
      /audit unavailable/,
    );

    expect(await repository.findByName('Rolled Back', ORG_A)).toBeNull();
  });
});
