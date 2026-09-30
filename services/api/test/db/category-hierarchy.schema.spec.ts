import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../src/config/configuration.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import type { CategoryRepository } from '../../src/categories/category.repository.js';
import { PrismaCategoryRepository } from '../../src/categories/prisma-category.repository.js';
import { CategoryService } from '../../src/categories/category.service.js';
import type { AuditRepository } from '../../src/audit/audit.repository.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import type { TenantContext } from '../../src/common/auth/authenticated-user.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaService;
let repository: CategoryRepository;

const ORG_A = 'a0000000-0000-4000-8000-000000000001';
const ORG_B = 'b0000000-0000-4000-8000-000000000002';
const USER = 'c0000000-0000-4000-8000-000000000003';

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
  repository = new PrismaCategoryRepository(prisma);
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.client.auditLog.deleteMany({});
  await prisma.client.category.deleteMany({});
  await prisma.client.user.deleteMany({});
  await prisma.client.organization.deleteMany({});
  await prisma.onModuleDestroy();
});

beforeEach(async () => {
  await prisma.client.auditLog.deleteMany({});
  await prisma.client.category.deleteMany({});
  await prisma.client.user.deleteMany({});
  await prisma.client.organization.deleteMany({});

  await prisma.client.organization.createMany({
    data: [
      {
        id: ORG_A,
        name: 'Catalog Mart A',
        legalName: 'Catalog Mart A Pvt Ltd',
        currency: 'NPR',
      },
      {
        id: ORG_B,
        name: 'Catalog Mart B',
        legalName: 'Catalog Mart B Pvt Ltd',
        currency: 'NPR',
      },
    ],
  });

  const user = await prisma.client.user.create({
    data: {
      id: USER,
      organizationId: ORG_A,
      name: 'Catalog Manager',
      email: 'catalog.manager@minimart.local',
      passwordHash: 'test-hash-not-a-real-credential',
    },
  });
  expect(user.id).toBe(USER);
});

/** Collects audit entries instead of persisting them, so no rows leak. */
function createService(): CategoryService {
  const auditRepository = {
    create: (entry: unknown) =>
      Promise.resolve({ id: 'audit', ...(entry as object) }),
  } as unknown as AuditRepository;
  const audit = { record: (entry: unknown) => auditRepository.create(entry) };
  return new CategoryService(repository, prisma, audit as never);
}

/**
 * Uses the real audit stack so the transaction and the persisted row are both
 * exercised against PostgreSQL.
 */
function createServiceWithRealAudit(): CategoryService {
  const audit = new AuditService(new PrismaAuditRepository(prisma));
  return new CategoryService(repository, prisma, audit);
}

describe('category hierarchy (database integration)', () => {
  it('stores a root category with a null parent', async () => {
    const service = createService();

    const created = (await service.create(ctxA, {
      name: 'Beverages',
    })) as { id: string; parentId: string | null };

    expect(created.parentId).toBeNull();
  });

  it('stores a child category under its parent', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };

    const child = (await service.create(ctxA, {
      name: 'Juice',
      parentId: root.id,
    })) as { parentId: string };

    expect(child.parentId).toBe(root.id);
  });

  it('enforces the database unique name per organization', async () => {
    await createService().create(ctxA, { name: 'Beverages' });

    await expect(
      prisma.client.category.create({
        data: { organizationId: ORG_A, name: 'Beverages' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows the same category name in a different organization', async () => {
    await createService().create(ctxA, { name: 'Beverages' });
    await createService().create(ctxB, { name: 'Beverages' });

    const a = await repository.findByName('Beverages', ORG_A);
    const b = await repository.findByName('Beverages', ORG_B);

    expect(a?.organizationId).toBe(ORG_A);
    expect(b?.organizationId).toBe(ORG_B);
  });

  it('does not return another organization category by id', async () => {
    const created = (await createService().create(ctxB, {
      name: 'Foreign',
    })) as { id: string };

    const found = await repository.findByIdInOrganization(created.id, ORG_A);

    expect(found).toBeNull();
  });

  it('rejects a cross-organization parent in the service', async () => {
    const foreign = (await createService().create(ctxB, {
      name: 'Foreign',
    })) as { id: string };

    await expect(
      createService().create(ctxA, {
        name: 'Smuggled',
        parentId: foreign.id,
      }),
    ).rejects.toThrow(/Invalid parentId/);
  });

  it('would accept a cross-organization parent at the database level', async () => {
    // Documents exactly why the service check is required rather than redundant:
    // the foreign key does not compare organizations.
    const foreign = await prisma.client.category.create({
      data: { organizationId: ORG_B, name: 'Foreign' },
    });
    const child = await prisma.client.category.create({
      data: { organizationId: ORG_A, name: 'Smuggled', parentId: foreign.id },
    });

    const parent = await prisma.client.category.findUnique({
      where: { id: child.parentId },
    });
    expect(parent?.organizationId).toBe(ORG_B);
  });

  it('rejects a cycle introduced through the service', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };
    const child = (await service.create(ctxA, {
      name: 'Juice',
      parentId: root.id,
    })) as { id: string };

    await expect(
      service.update(ctxA, root.id, { parentId: child.id }),
    ).rejects.toThrow(/cycle/);
  });

  it('rejects self-parenting through the service', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };

    await expect(
      service.update(ctxA, root.id, { parentId: root.id }),
    ).rejects.toThrow(/own parent/);
  });

  it('permits a cycle at the database level, confirming the check is load-bearing', async () => {
    // The self-referencing foreign key carries no cycle check, so the database
    // happily stores a loop. Without the service-level guard the hierarchy would
    // not be a tree.
    const a = await prisma.client.category.create({
      data: { organizationId: ORG_A, name: 'Cycle A' },
    });
    const b = await prisma.client.category.create({
      data: { organizationId: ORG_A, name: 'Cycle B', parentId: a.id },
    });
    await prisma.client.category.update({
      where: { id: a.id },
      data: { parentId: b.id },
    });

    const head = await repository.findParentIdInOrganization(b.id, ORG_A);
    const tail = await repository.findParentIdInOrganization(a.id, ORG_A);
    expect(head).toBe(a.id);
    expect(tail).toBe(b.id);
  });

  it('moves a category to the root with an explicit null parent', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };
    const child = (await service.create(ctxA, {
      name: 'Juice',
      parentId: root.id,
    })) as { id: string };

    const moved = (await service.update(ctxA, child.id, {
      parentId: null,
    })) as { parentId: string | null };

    expect(moved.parentId).toBeNull();
  });

  it('leaves the parent untouched when parentId is omitted', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };
    const child = (await service.create(ctxA, {
      name: 'Juice',
      parentId: root.id,
    })) as { id: string };

    const renamed = (await service.update(ctxA, child.id, {
      name: 'Fruit Juice',
    })) as { parentId: string };

    expect(renamed.parentId).toBe(root.id);
  });

  it('refuses to delete a category that still has children', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };
    await service.create(ctxA, { name: 'Juice', parentId: root.id });

    await expect(service.delete(ctxA, root.id)).rejects.toThrow(
      /still referenced/,
    );
  });

  it('deletes an unreferenced category', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };

    await service.delete(ctxA, root.id);

    expect(await repository.findByIdInOrganization(root.id, ORG_A)).toBeNull();
  });

  it('refuses to delete a category in another organization', async () => {
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

  it('paginates and counts within the organization', async () => {
    const service = createService();
    for (const name of ['A', 'B', 'C']) {
      await service.create(ctxA, { name });
    }
    await service.create(ctxB, { name: 'D' });

    const page = (await service.findAll(ctxA, { page: 1, limit: 2 })) as {
      data: Array<{ name: string }>;
      total: number;
      limit: number;
    };

    expect(page.limit).toBe(2);
    // The organization total excludes the other tenant's category.
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(2);
    // Default ordering is createdAt descending, so the two newest come first.
    expect(page.data.map((row) => row.name).sort()).toEqual(['B', 'C']);
  });

  it('filters the list by parent', async () => {
    const service = createService();
    const root = (await service.create(ctxA, { name: 'Beverages' })) as {
      id: string;
    };
    await service.create(ctxA, { name: 'Juice', parentId: root.id });
    await service.create(ctxA, { name: 'Stationery' });

    const page = (await service.findAll(ctxA, {
      parentId: root.id,
    })) as { data: Array<{ name: string }> };

    expect(page.data.map((row) => row.name)).toEqual(['Juice']);
  });

  it('writes an audit record for a mutation inside the business transaction', async () => {
    const service = createServiceWithRealAudit();

    const created = (await service.create(ctxA, {
      name: 'Beverages',
    })) as { id: string };

    const entries = await prisma.client.auditLog.findMany({
      where: { entity: 'Category', entityId: created.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('category.create');
    expect(entries[0].userId).toBe(USER);
    expect(entries[0].organizationId).toBe(ORG_A);
  });

  it('records the before and after state of an update', async () => {
    const service = createServiceWithRealAudit();
    const created = (await service.create(ctxA, {
      name: 'Beverages',
    })) as { id: string };

    await service.update(ctxA, created.id, { name: 'Drinks' });

    const entry = await prisma.client.auditLog.findFirst({
      where: {
        entity: 'Category',
        entityId: created.id,
        action: 'category.update',
      },
    });
    expect(entry?.before).toMatchObject({ name: 'Beverages' });
    expect(entry?.after).toMatchObject({ name: 'Drinks' });
  });

  it('rolls back the category when the audit write fails', async () => {
    const failingAudit = {
      record: () => Promise.reject(new Error('audit unavailable')),
    };
    const service = new CategoryService(
      repository,
      prisma,
      failingAudit as never,
    );

    await expect(service.create(ctxA, { name: 'Rolled Back' })).rejects.toThrow(
      /audit unavailable/,
    );

    expect(await repository.findByName('Rolled Back', ORG_A)).toBeNull();
  });
});
