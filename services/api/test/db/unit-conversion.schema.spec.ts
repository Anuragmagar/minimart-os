import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../src/config/configuration.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import type { UnitConversionRepository } from '../../src/unit-conversions/unit-conversion.repository.js';
import { PrismaUnitConversionRepository } from '../../src/unit-conversions/prisma-unit-conversion.repository.js';
import { UnitConversionService } from '../../src/unit-conversions/unit-conversion.service.js';
import type { UnitRepository } from '../../src/units/unit.repository.js';
import { PrismaUnitRepository } from '../../src/units/prisma-unit.repository.js';
import type { AuditRepository } from '../../src/audit/audit.repository.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import type { TenantContext } from '../../src/common/auth/authenticated-user.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaService;
let repository: UnitConversionRepository;
let unitRepository: UnitRepository;

const ORG_A = 'a0000000-0000-4000-8000-0000000000a4';
const ORG_B = 'b0000000-0000-4000-8000-0000000000b4';
const USER = 'c0000000-0000-4000-8000-0000000000c4';
const DOZ = 'd0000000-0000-4000-8000-0000000000d4';
const PCS = 'e0000000-0000-4000-8000-0000000000e4';
const BOX = 'f0000000-0000-4000-8000-0000000000f4';
const CARTON = 'a1000000-0000-4000-8000-0000000000a4';
const FOREIGN_DOZ = 'a2000000-0000-4000-8000-0000000000a2';
const FOREIGN_PCS = 'a3000000-0000-4000-8000-0000000000a3';

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
  repository = new PrismaUnitConversionRepository(prisma);
  unitRepository = new PrismaUnitRepository(prisma);
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
        name: 'Conversion Mart A',
        legalName: 'Conversion Mart A Pvt Ltd',
        currency: 'NPR',
      },
      {
        id: ORG_B,
        name: 'Conversion Mart B',
        legalName: 'Conversion Mart B Pvt Ltd',
        currency: 'NPR',
      },
    ],
  });

  await prisma.client.user.create({
    data: {
      id: USER,
      organizationId: ORG_A,
      name: 'Conversion Manager',
      email: 'conversion.manager@minimart.local',
      passwordHash: 'test-hash-not-a-real-credential',
    },
  });

  await prisma.client.unit.createMany({
    data: [
      {
        id: DOZ,
        organizationId: ORG_A,
        name: 'Dozen',
        code: 'DOZ',
        precision: 0,
      },
      {
        id: PCS,
        organizationId: ORG_A,
        name: 'Piece',
        code: 'PCS',
        precision: 0,
      },
      {
        id: BOX,
        organizationId: ORG_A,
        name: 'Box',
        code: 'BOX',
        precision: 0,
      },
      {
        id: CARTON,
        organizationId: ORG_A,
        name: 'Carton',
        code: 'CTN',
        precision: 0,
      },
    ],
  });

  // ORG_B gets its own pair so a cross-tenant read is proven against real rows
  // rather than assumed. The foreign keys do not check organization, so the
  // service is the only thing preventing a cross-tenant edge.
  await prisma.client.unit.createMany({
    data: [
      {
        id: FOREIGN_DOZ,
        organizationId: ORG_B,
        name: 'Foreign Dozen',
        code: 'FDOZ',
        precision: 0,
      },
      {
        id: FOREIGN_PCS,
        organizationId: ORG_B,
        name: 'Foreign Piece',
        code: 'FPCS',
        precision: 0,
      },
    ],
  });
});

/** Collects audit entries instead of persisting them, so no rows leak. */
function createService(): UnitConversionService {
  const auditRepository = {
    create: (entry: unknown) =>
      Promise.resolve({ id: 'audit', ...(entry as object) }),
  } as unknown as AuditRepository;
  const audit = { record: (entry: unknown) => auditRepository.create(entry) };
  return new UnitConversionService(
    repository,
    unitRepository,
    prisma,
    audit as never,
  );
}

/**
 * Uses the real audit stack so the transaction and the persisted row are both
 * exercised against PostgreSQL.
 */
function createServiceWithRealAudit(): UnitConversionService {
  const audit = new AuditService(new PrismaAuditRepository(prisma));
  return new UnitConversionService(repository, unitRepository, prisma, audit);
}

describe('unit conversion management (database integration)', () => {
  it('stores a conversion with its direction and factor', async () => {
    const created = (await createService().create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { organizationId: string; multiplier: unknown };

    expect(created.organizationId).toBe(ORG_A);
    expect(Number(created.multiplier.toString())).toBe(12);
  });

  it('enforces the unique direction per organization', async () => {
    await createService().create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    await expect(
      prisma.client.unitConversion.create({
        data: {
          organizationId: ORG_A,
          fromUnitId: DOZ,
          toUnitId: PCS,
          multiplier: '12',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a duplicate direction through the service', async () => {
    await createService().create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    await expect(
      createService().create(ctxA, {
        fromUnitId: DOZ,
        toUnitId: PCS,
        multiplier: '12',
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('allows the same direction in a different organization', async () => {
    await createService().create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });
    await createService().create(ctxB, {
      fromUnitId: FOREIGN_DOZ,
      toUnitId: FOREIGN_PCS,
      multiplier: '24',
    });

    const a = await repository.findByDirection(DOZ, PCS, ORG_A);
    const b = await repository.findByDirection(FOREIGN_DOZ, FOREIGN_PCS, ORG_B);

    // The unique constraint is per organization, so both rows coexist.
    expect(a?.organizationId).toBe(ORG_A);
    expect(b?.organizationId).toBe(ORG_B);
    expect(Number(b?.multiplier.toString())).toBe(24);
  });

  it('records the reciprocal direction as its own row', async () => {
    const service = createService();
    await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    const reverse = (await service.create(ctxA, {
      fromUnitId: PCS,
      toUnitId: DOZ,
      multiplier: '0.083333',
    })) as { multiplier: unknown };

    // Both rows coexist, each with the factor that was entered, and neither was
    // derived from the other.
    const rows = await prisma.client.unitConversion.findMany({
      where: { organizationId: ORG_A },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(Number(reverse.multiplier.toString())).toBeCloseTo(0.083333, 6);
  });

  it('preserves six decimal places exactly', async () => {
    const created = (await createService().create(ctxA, {
      fromUnitId: PCS,
      toUnitId: DOZ,
      multiplier: '0.083333',
    })) as { multiplier: unknown };

    expect(created.multiplier.toString()).toBe('0.083333');
  });

  it('does not return another organization conversion by id', async () => {
    const created = (await createService().create(ctxB, {
      fromUnitId: FOREIGN_DOZ,
      toUnitId: FOREIGN_PCS,
      multiplier: '1',
    })) as { id: string };

    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).toBeNull();
  });

  it('refuses a source unit from another organization', async () => {
    await expect(
      createService().create(ctxA, {
        fromUnitId: FOREIGN_DOZ,
        toUnitId: PCS,
        multiplier: '1',
      }),
    ).rejects.toThrow(/source unit not found/i);
  });

  it('refuses a target unit from another organization', async () => {
    await expect(
      createService().create(ctxA, {
        fromUnitId: DOZ,
        toUnitId: FOREIGN_PCS,
        multiplier: '1',
      }),
    ).rejects.toThrow(/target unit not found/i);
  });

  it('would accept a cross-tenant edge if the service did not check', async () => {
    // The foreign keys on unit_conversions only check that the unit ids exist, so
    // the organization check in the service is the only barrier. This documents
    // why it must not be dropped.
    const crossed = await prisma.client.unitConversion.create({
      data: {
        organizationId: ORG_A,
        fromUnitId: FOREIGN_DOZ,
        toUnitId: PCS,
        multiplier: '1',
      },
    });

    expect(crossed.organizationId).toBe(ORG_A);
  });

  it('rejects a conversion that would close a three-unit loop', async () => {
    const service = createService();
    await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });
    await service.create(ctxA, {
      fromUnitId: PCS,
      toUnitId: BOX,
      multiplier: '2',
    });

    await expect(
      service.create(ctxA, { fromUnitId: BOX, toUnitId: DOZ, multiplier: '1' }),
    ).rejects.toThrow(/cycle/i);

    const rows = await prisma.client.unitConversion.findMany({
      where: { organizationId: ORG_A },
    });
    expect(rows).toHaveLength(2);
  });

  it('allows a reciprocal pair while still refusing a third-unit loop', async () => {
    const service = createService();
    await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });
    // The reciprocal is permitted.
    await expect(
      service.create(ctxA, {
        fromUnitId: PCS,
        toUnitId: DOZ,
        multiplier: '0.083333',
      }),
    ).resolves.toBeDefined();

    // BOX -> PCS plus the permitted PCS -> DOZ means DOZ -> BOX would close
    // DOZ -> BOX -> PCS -> DOZ.
    await service.create(ctxA, {
      fromUnitId: BOX,
      toUnitId: PCS,
      multiplier: '2',
    });
    await expect(
      service.create(ctxA, { fromUnitId: DOZ, toUnitId: BOX, multiplier: '1' }),
    ).rejects.toThrow(/cycle/i);
  });

  it('lists conversions scoped to the organization with both units joined', async () => {
    const service = createService();
    await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });
    await service.create(ctxA, {
      fromUnitId: BOX,
      toUnitId: PCS,
      multiplier: '10',
    });

    const page = (await service.findAll(ctxA, { page: 1, limit: 20 })) as {
      data: Array<{
        multiplier: unknown;
        fromUnit: { code: string } | null;
        toUnit: { code: string } | null;
      }>;
      total: number;
    };

    expect(page.total).toBe(2);
    const row = page.data.find((entry) => entry.fromUnit?.code === 'DOZ');
    expect(row?.toUnit?.code).toBe('PCS');
    expect(Number(row?.multiplier.toString())).toBe(12);
  });

  it('filters by source and by target unit', async () => {
    const service = createService();
    await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });
    await service.create(ctxA, {
      fromUnitId: BOX,
      toUnitId: PCS,
      multiplier: '10',
    });

    const bySource = (await service.findAll(ctxA, {
      fromUnitId: DOZ,
    })) as { data: unknown[]; total: number };
    expect(bySource.total).toBe(1);

    const byTarget = (await service.findAll(ctxA, {
      toUnitId: PCS,
    })) as { data: unknown[]; total: number };
    expect(byTarget.total).toBe(2);
  });

  it('updates only the multiplier', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string; multiplier: unknown };

    const updated = (await service.update(ctxA, created.id, {
      multiplier: '6',
    })) as { multiplier: unknown; fromUnitId: string; toUnitId: string };

    expect(Number(updated.multiplier.toString())).toBe(6);
    expect(updated.fromUnitId).toBe(DOZ);
    expect(updated.toUnitId).toBe(PCS);
  });

  it('rejects a non-positive multiplier on update', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    await expect(
      service.update(ctxA, created.id, { multiplier: '0' }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('refuses to update a conversion in another organization', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    await expect(
      service.update(ctxB, created.id, { multiplier: '99' }),
    ).rejects.toThrow(/not found/i);
  });

  it('deletes a conversion outright, since the model has no status column', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    await service.delete(ctxA, created.id);

    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).toBeNull();
  });

  it('refuses to delete a conversion in another organization', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    await expect(service.delete(ctxB, created.id)).rejects.toThrow(
      /not found/i,
    );
    expect(
      await repository.findByIdInOrganization(created.id, ORG_A),
    ).not.toBeNull();
  });

  it('blocks deleting a unit that a conversion still references', async () => {
    // Documents why the 05.03 unit delete guard counts conversions: both
    // relations are RESTRICT at the database level.
    await createService().create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    await expect(
      prisma.client.unit.delete({ where: { id: DOZ } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.client.unit.delete({ where: { id: PCS } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('allows a unit to be deleted once its conversions are gone', async () => {
    const service = createService();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    await service.delete(ctxA, created.id);
    await prisma.client.unit.delete({ where: { id: DOZ } });

    const unit = await prisma.client.unit.findUnique({ where: { id: DOZ } });
    expect(unit).toBeNull();
  });

  it('writes an audit record in the business transaction', async () => {
    const service = createServiceWithRealAudit();

    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    const entries = await prisma.client.auditLog.findMany({
      where: { entity: 'UnitConversion', entityId: created.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('unit_conversion.create');
    expect(entries[0].userId).toBe(USER);
    expect(entries[0].organizationId).toBe(ORG_A);
  });

  it('records the before and after multiplier of an update', async () => {
    const service = createServiceWithRealAudit();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    await service.update(ctxA, created.id, { multiplier: '6' });

    const entry = await prisma.client.auditLog.findFirst({
      where: {
        entity: 'UnitConversion',
        entityId: created.id,
        action: 'unit_conversion.update',
      },
    });
    // The audit payload stores the multiplier as a string, so the comparison
    // proves the exact decimal was captured rather than a float rendering.
    expect(entry?.before).toMatchObject({ multiplier: '12' });
    expect(entry?.after).toMatchObject({ multiplier: '6' });
  });

  it('records a delete', async () => {
    const service = createServiceWithRealAudit();
    const created = (await service.create(ctxA, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    })) as { id: string };

    await service.delete(ctxA, created.id);

    const entry = await prisma.client.auditLog.findFirst({
      where: {
        entity: 'UnitConversion',
        entityId: created.id,
        action: 'unit_conversion.delete',
      },
    });
    expect(entry).not.toBeNull();
    expect(entry?.after).toBeNull();
  });

  it('rolls back the conversion when the audit write fails', async () => {
    const service = new UnitConversionService(
      repository,
      unitRepository,
      prisma,
      { record: () => Promise.reject(new Error('audit unavailable')) } as never,
    );

    await expect(
      service.create(ctxA, {
        fromUnitId: DOZ,
        toUnitId: PCS,
        multiplier: '12',
      }),
    ).rejects.toThrow(/audit unavailable/);

    expect(await repository.findByDirection(DOZ, PCS, ORG_A)).toBeNull();
  });
});
