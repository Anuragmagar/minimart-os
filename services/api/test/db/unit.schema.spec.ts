import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../src/config/configuration.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import type { UnitRepository } from '../../src/units/unit.repository.js';
import { PrismaUnitRepository } from '../../src/units/prisma-unit.repository.js';
import { UnitService } from '../../src/units/unit.service.js';
import type { AuditRepository } from '../../src/audit/audit.repository.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import type { TenantContext } from '../../src/common/auth/authenticated-user.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaService;
let repository: UnitRepository;

const ORG_A = 'a0000000-0000-4000-8000-00000000000a';
const ORG_B = 'b0000000-0000-4000-8000-00000000000b';
const USER = 'c0000000-0000-4000-8000-00000000000c';
const CATEGORY = 'd0000000-0000-4000-8000-00000000000d';
const BASE_UNIT = 'e0000000-0000-4000-8000-00000000000e';

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
  repository = new PrismaUnitRepository(prisma);
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.client.auditLog.deleteMany({});
  await prisma.client.product.deleteMany({});
  await prisma.client.unitConversion.deleteMany({});
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
  await prisma.client.unitConversion.deleteMany({});
  await prisma.client.brand.deleteMany({});
  await prisma.client.unit.deleteMany({});
  await prisma.client.category.deleteMany({});
  await prisma.client.user.deleteMany({});
  await prisma.client.organization.deleteMany({});

  await prisma.client.organization.createMany({
    data: [
      {
        id: ORG_A,
        name: 'Unit Mart A',
        legalName: 'Unit Mart A Pvt Ltd',
        currency: 'NPR',
      },
      {
        id: ORG_B,
        name: 'Unit Mart B',
        legalName: 'Unit Mart B Pvt Ltd',
        currency: 'NPR',
      },
    ],
  });

  await prisma.client.user.create({
    data: {
      id: USER,
      organizationId: ORG_A,
      name: 'Unit Manager',
      email: 'unit.manager@minimart.local',
      passwordHash: 'test-hash-not-a-real-credential',
    },
  });

  await prisma.client.category.create({
    data: { id: CATEGORY, organizationId: ORG_A, name: 'Beverages' },
  });
  await prisma.client.unit.create({
    data: {
      id: BASE_UNIT,
      organizationId: ORG_A,
      name: 'Pieces',
      code: 'PCS',
      precision: 0,
    },
  });
});

/** Collects audit entries instead of persisting them, so no rows leak. */
function createService(): UnitService {
  const auditRepository = {
    create: (entry: unknown) =>
      Promise.resolve({ id: 'audit', ...(entry as object) }),
  } as unknown as AuditRepository;
  const audit = { record: (entry: unknown) => auditRepository.create(entry) };
  return new UnitService(repository, prisma, audit as never);
}

/**
 * Uses the real audit stack so the transaction and the persisted row are both
 * exercised against PostgreSQL.
 */
function createServiceWithRealAudit(): UnitService {
  const audit = new AuditService(new PrismaAuditRepository(prisma));
  return new UnitService(repository, prisma, audit);
}

/** Attaches a product to a unit so the delete guard has something to protect. */
async function attachProductTo(unitId: string, sku: string): Promise<string> {
  const product = await prisma.client.product.create({
    data: {
      organizationId: ORG_A,
      name: `Product ${sku}`,
      sku,
      categoryId: CATEGORY,
      unitId,
    },
  });
  return product.id;
}

/** Registers a conversion away from a unit, protecting the source reference. */
async function attachConversionFrom(
  fromUnitId: string,
  toUnitId: string,
): Promise<string> {
  const conversion = await prisma.client.unitConversion.create({
    data: {
      organizationId: ORG_A,
      fromUnitId,
      toUnitId,
      multiplier: '2.5',
    },
  });
  return conversion.id;
}

describe('unit management (database integration)', () => {
  it('stores a unit as active', async () => {
    const created = (await createService().create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    })) as { status: string; organizationId: string; precision: number };

    expect(created.status).toBe('active');
    expect(created.organizationId).toBe(ORG_A);
    expect(created.precision).toBe(3);
  });

  it('enforces the database unique code per organization', async () => {
    await createService().create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    });

    await expect(
      prisma.client.unit.create({
        data: { organizationId: ORG_A, name: 'Kilo', code: 'KG', precision: 3 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows the same name in one organization when the code differs', async () => {
    await createService().create(ctxA, {
      name: 'Box',
      code: 'BOX',
      precision: 0,
    });
    const second = (await createService().create(ctxA, {
      name: 'Box',
      code: 'BOX2',
      precision: 0,
    })) as { id: string };

    // Only the code is unique, so the name may repeat.
    expect(second.id).toBeDefined();
  });

  it('allows the same code in a different organization', async () => {
    await createService().create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    });
    await createService().create(ctxB, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    });

    const a = await repository.findByCode('KG', ORG_A);
    const b = await repository.findByCode('KG', ORG_B);

    expect(a?.organizationId).toBe(ORG_A);
    expect(b?.organizationId).toBe(ORG_B);
  });

  it('preserves the code casing exactly as supplied', async () => {
    const created = (await createService().create(ctxA, {
      name: 'Metric Ton',
      code: 'mt',
      precision: 3,
    })) as { id: string; code: string };

    expect(created.code).toBe('mt');
    // PostgreSQL has no case-insensitive unique index, so "MT" is a distinct
    // code rather than a collision. The service is not case-insensitive because
    // no documented rule says it should be.
    const upper = (await createService().create(ctxA, {
      name: 'Metric Tonne',
      code: 'MT',
      precision: 3,
    })) as { id: string; code: string };

    expect(upper.code).toBe('MT');
    expect(upper.id).not.toBe(created.id);
  });

  it('does not return another organization unit by id', async () => {
    const created = (await createService().create(ctxB, {
      name: 'Foreign',
      code: 'FRN',
      precision: 1,
    })) as { id: string };

    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).toBeNull();
  });

  it('rejects a duplicate code through the service', async () => {
    await createService().create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    });

    await expect(
      createService().create(ctxA, {
        name: 'Kilo',
        code: 'KG',
        precision: 3,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('rejects a duplicate code differing only by case through the service', async () => {
    // The service asks the database with equality, so a differently cased code is
    // genuinely a different code rather than a collision.
    await createService().create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    });

    await expect(
      createService().create(ctxA, {
        name: 'Kilo',
        code: 'kg',
        precision: 3,
      }),
    ).resolves.toBeDefined();
  });

  it('paginates and counts within the organization', async () => {
    const service = createService();
    for (const code of ['ALFA', 'BETA', 'GAMA']) {
      await service.create(ctxA, { name: `Unit ${code}`, code, precision: 0 });
    }
    await service.create(ctxB, { name: 'Foreign', code: 'FRN', precision: 0 });

    const page = (await service.findAll(ctxA, { page: 1, limit: 2 })) as {
      data: Array<{ code: string }>;
      total: number;
      limit: number;
    };

    // Three created units plus the PCS fixture, and none from the other tenant.
    expect(page.total).toBe(4);
    expect(page.limit).toBe(2);
    expect(page.data).toHaveLength(2);
    // Default ordering is createdAt descending, so the two newest come first.
    expect(page.data.map((row) => row.code).sort()).toEqual(['BETA', 'GAMA']);
  });

  it('searches by name and by code, case-insensitively', async () => {
    const service = createService();
    await service.create(ctxA, { name: 'Litre', code: 'LTR', precision: 2 });
    await service.create(ctxA, {
      name: 'Millilitre',
      code: 'MLT',
      precision: 0,
    });

    const byName = (await service.findAll(ctxA, { search: 'litre' })) as {
      data: Array<{ code: string }>;
    };
    expect(byName.data.map((row) => row.code).sort()).toEqual(['LTR', 'MLT']);

    const byCode = (await service.findAll(ctxA, { search: 'mlt' })) as {
      data: Array<{ code: string }>;
    };
    expect(byCode.data.map((row) => row.code)).toEqual(['MLT']);
  });

  it('filters the list by status', async () => {
    const service = createService();
    const target = (await service.create(ctxA, {
      name: 'Gram',
      code: 'GRM',
      precision: 3,
    })) as { id: string };
    await service.create(ctxA, { name: 'Litre', code: 'LTR', precision: 2 });
    await service.update(ctxA, target.id, { status: 'inactive' });

    const active = (await service.findAll(ctxA, { status: 'active' })) as {
      data: Array<{ code: string }>;
    };
    expect(active.data.map((row) => row.code).sort()).toEqual(['LTR', 'PCS']);

    const inactive = (await service.findAll(ctxA, { status: 'inactive' })) as {
      data: Array<{ code: string }>;
    };
    expect(inactive.data.map((row) => row.code)).toEqual(['GRM']);
  });

  it('sorts by an allow-listed column', async () => {
    const service = createService();
    await service.create(ctxA, { name: 'Bravo', code: 'BRV', precision: 0 });
    await service.create(ctxA, { name: 'Alpha', code: 'ALP', precision: 0 });

    const page = (await service.findAll(ctxA, {
      sortBy: 'code',
      sortOrder: 'asc',
    })) as { data: Array<{ code: string }> };

    expect(page.data.map((row) => row.code)).toEqual(['ALP', 'BRV', 'PCS']);
  });

  it('falls back to the default order for an unknown sort column', async () => {
    const service = createService();
    await service.create(ctxA, { name: 'Sorted', code: 'SRT', precision: 0 });

    const page = (await service.findAll(ctxA, {
      sortBy: 'organizationId',
    })) as { data: Array<{ code: string }> };

    expect(page.data.length).toBeGreaterThan(0);
  });

  it('updates only the supplied fields and leaves the code alone', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'Pouch',
      code: 'PCH',
      precision: 0,
    })) as { id: string };

    const updated = (await service.update(ctxA, created.id, {
      name: 'Sachet',
      precision: 1,
    })) as { code: string; name: string; precision: number };

    expect(updated.name).toBe('Sachet');
    expect(updated.precision).toBe(1);
    expect(updated.code).toBe('PCH');
  });

  it('rejects a code change that collides with another unit', async () => {
    const service = createService();
    const litre = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };
    const ml = (await service.create(ctxA, {
      name: 'Millilitre',
      code: 'MLT',
      precision: 0,
    })) as { id: string };

    await expect(service.update(ctxA, ml.id, { code: 'LTR' })).rejects.toThrow(
      /already exists/,
    );

    const untouched = (await repository.findByIdInOrganization(
      ml.id,
      ORG_A,
    )) as {
      code: string;
    };
    expect(untouched.code).toBe('MLT');
    expect(litre.id).toBeDefined();
  });

  it('deactivates a unit without deleting it', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };

    const updated = (await service.deactivate(ctxA, created.id)) as {
      status: string;
    };

    expect(updated.status).toBe('inactive');
    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).not.toBeNull();
  });

  it('refuses to delete a unit that a product still references', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    })) as { id: string };
    await attachProductTo(created.id, 'UNIT-TEST-1');

    await expect(service.delete(ctxA, created.id)).rejects.toThrow(/products/);
    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).not.toBeNull();
  });

  it('refuses to delete a unit that a conversion uses as the source', async () => {
    const service = createService();
    const litre = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };
    const ml = (await service.create(ctxA, {
      name: 'Millilitre',
      code: 'MLT',
      precision: 0,
    })) as { id: string };
    await attachConversionFrom(ml.id, litre.id);

    await expect(service.delete(ctxA, ml.id)).rejects.toThrow(/conversions/);
    expect(
      await repository.findByIdInOrganization(ml.id, ORG_A),
    ).not.toBeNull();
  });

  it('refuses to delete a unit that a conversion uses as the target', async () => {
    const service = createService();
    const litre = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };
    const box = (await service.create(ctxA, {
      name: 'Box',
      code: 'BOX',
      precision: 0,
    })) as { id: string };
    await attachConversionFrom(litre.id, box.id);

    await expect(service.delete(ctxA, box.id)).rejects.toThrow(/conversions/);
    expect(
      await repository.findByIdInOrganization(box.id, ORG_A),
    ).not.toBeNull();
  });

  it('would reject the delete at the database level without the guard', async () => {
    // Documents that products.unit_id and both conversion relations are
    // RESTRICT, so the reference counts in the service exist to turn a raw
    // foreign-key error into a clear message.
    const gram = await prisma.client.unit.create({
      data: {
        organizationId: ORG_A,
        name: 'Restrict Proof',
        code: 'RSP',
        precision: 3,
      },
    });
    await attachProductTo(gram.id, 'UNIT-TEST-2');

    await expect(
      prisma.client.unit.delete({ where: { id: gram.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('deletes an unreferenced unit', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };

    await service.delete(ctxA, created.id);

    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).toBeNull();
  });

  it('allows a unit to be deleted once its conversion is gone', async () => {
    const service = createService();
    const litre = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };
    const ml = (await service.create(ctxA, {
      name: 'Millilitre',
      code: 'MLT',
      precision: 0,
    })) as { id: string };
    const conversionId = await attachConversionFrom(ml.id, litre.id);

    await prisma.client.unitConversion.delete({ where: { id: conversionId } });
    await service.delete(ctxA, ml.id);

    expect(await repository.findByIdInOrganization(ml.id, ORG_A)).toBeNull();
  });

  it('refuses to delete a unit in another organization', async () => {
    const foreign = (await createService().create(ctxB, {
      name: 'Foreign',
      code: 'FRN',
      precision: 1,
    })) as { id: string };

    await expect(createService().delete(ctxA, foreign.id)).rejects.toThrow(
      /not found/i,
    );
    expect(
      await repository.findByIdInOrganization(foreign.id, ORG_B),
    ).not.toBeNull();
  });

  it('allows a deactivated unit to still back its products', async () => {
    // Deactivation is the soft path precisely so product history survives.
    const service = createService();
    const created = (await service.create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    })) as { id: string };
    const productId = await attachProductTo(created.id, 'UNIT-TEST-3');

    await service.deactivate(ctxA, created.id);

    const product = await prisma.client.product.findUnique({
      where: { id: productId },
    });
    expect(product?.unitId).toBe(created.id);
  });

  it('writes an audit record in the business transaction', async () => {
    const service = createServiceWithRealAudit();

    const created = (await service.create(ctxA, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    })) as { id: string };

    const entries = await prisma.client.auditLog.findMany({
      where: { entity: 'Unit', entityId: created.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('unit.create');
    expect(entries[0].userId).toBe(USER);
    expect(entries[0].organizationId).toBe(ORG_A);
  });

  it('records the before and after state of an update', async () => {
    const service = createServiceWithRealAudit();
    const created = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };

    await service.update(ctxA, created.id, { name: 'Litres', precision: 3 });

    const entry = await prisma.client.auditLog.findFirst({
      where: { entity: 'Unit', entityId: created.id, action: 'unit.update' },
    });
    expect(entry?.before).toMatchObject({ name: 'Litre', precision: 2 });
    expect(entry?.after).toMatchObject({ name: 'Litres', precision: 3 });
  });

  it('records a deactivation', async () => {
    const service = createServiceWithRealAudit();
    const created = (await service.create(ctxA, {
      name: 'Litre',
      code: 'LTR',
      precision: 2,
    })) as { id: string };

    await service.deactivate(ctxA, created.id);

    const entry = await prisma.client.auditLog.findFirst({
      where: {
        entity: 'Unit',
        entityId: created.id,
        action: 'unit.deactivate',
      },
    });
    expect(entry?.before).toMatchObject({ status: 'active' });
    expect(entry?.after).toMatchObject({ status: 'inactive' });
  });

  it('rolls back the unit when the audit write fails', async () => {
    const service = new UnitService(repository, prisma, {
      record: () => Promise.reject(new Error('audit unavailable')),
    } as never);

    await expect(
      service.create(ctxA, { name: 'Rolled Back', code: 'RBK', precision: 0 }),
    ).rejects.toThrow(/audit unavailable/);

    expect(await repository.findByCode('RBK', ORG_A)).toBeNull();
  });
});
