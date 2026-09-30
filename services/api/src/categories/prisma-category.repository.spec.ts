import { describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../database/prisma.service.js';
import { CategoryRepository } from './category.repository.js';
import { PrismaCategoryRepository } from './prisma-category.repository.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_ID = '44444444-4444-4444-8444-444444444444';

function createRepository(prisma: PrismaService): CategoryRepository {
  return new PrismaCategoryRepository(prisma);
}

function createPrismaService(category: Record<string, unknown>) {
  return { client: { category } } as unknown as PrismaService;
}

describe('PrismaCategoryRepository', () => {
  it('scopes a lookup by id to the organization', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = createRepository(createPrismaService({ findFirst }));

    await repository.findByIdInOrganization(CATEGORY_ID, ORG_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID, organizationId: ORG_ID },
    });
  });

  it('uses findFirst rather than findUnique so the organization stays in the where clause', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findUnique = vi.fn();
    const repository = createRepository(
      createPrismaService({ findFirst, findUnique }),
    );

    await repository.findByIdInOrganization(CATEGORY_ID, ORG_ID);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('scopes a lookup by name to the organization', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = createRepository(createPrismaService({ findFirst }));

    await repository.findByName('Beverages', ORG_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { name: 'Beverages', organizationId: ORG_ID },
    });
  });

  it('returns the parent id when the category has one', async () => {
    const findFirst = vi.fn().mockResolvedValue({ parentId: PARENT_ID });
    const repository = createRepository(createPrismaService({ findFirst }));

    const result = await repository.findParentIdInOrganization(
      CATEGORY_ID,
      ORG_ID,
    );

    expect(result).toBe(PARENT_ID);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID, organizationId: ORG_ID },
      select: { parentId: true },
    });
  });

  it('reports a root category as a null parent', async () => {
    const findFirst = vi.fn().mockResolvedValue({ parentId: null });
    const repository = createRepository(createPrismaService({ findFirst }));

    const result = await repository.findParentIdInOrganization(
      CATEGORY_ID,
      ORG_ID,
    );

    expect(result).toBeNull();
  });

  it('reports an unknown category as a null parent', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = createRepository(createPrismaService({ findFirst }));

    const result = await repository.findParentIdInOrganization(
      CATEGORY_ID,
      ORG_ID,
    );

    expect(result).toBeNull();
  });

  it('always includes the organization in the list filter', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const repository = createRepository(
      createPrismaService({ findMany, count }),
    );

    await repository.findAllInOrganization({ search: 'Bev' }, ORG_ID);

    const call = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
    };
    expect(call.where.organizationId).toBe(ORG_ID);
    expect(call.where.name).toEqual({
      contains: 'Bev',
      mode: 'insensitive',
    });
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
  });

  it('applies page and limit to the pagination window', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const repository = createRepository(
      createPrismaService({ findMany, count }),
    );

    const result = await repository.findAllInOrganization(
      { page: 3, limit: 5 },
      ORG_ID,
    );

    const call = findMany.mock.calls[0][0] as { skip: number; take: number };
    expect(call.skip).toBe(10);
    expect(call.take).toBe(5);
    expect(result).toMatchObject({
      page: 3,
      limit: 5,
      total: 0,
      totalPages: 0,
    });
  });

  it('filters by parent id', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const repository = createRepository(
      createPrismaService({ findMany, count }),
    );

    await repository.findAllInOrganization({ parentId: PARENT_ID }, ORG_ID);

    const call = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.parentId).toBe(PARENT_ID);
    expect(call.where.organizationId).toBe(ORG_ID);
  });

  it('falls back to createdAt when the sort column is not in the allow-list', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const repository = createRepository(
      createPrismaService({ findMany, count }),
    );

    await repository.findAllInOrganization(
      { sortBy: 'organizationId', sortOrder: 'asc' },
      ORG_ID,
    );

    const call = findMany.mock.calls[0][0] as {
      orderBy: Record<string, string>;
    };
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('honours an allow-listed sort column', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const repository = createRepository(
      createPrismaService({ findMany, count }),
    );

    await repository.findAllInOrganization(
      { sortBy: 'name', sortOrder: 'asc' },
      ORG_ID,
    );

    const call = findMany.mock.calls[0][0] as {
      orderBy: Record<string, string>;
    };
    expect(call.orderBy).toEqual({ name: 'asc' });
  });

  it('writes through the transaction client when a transaction is passed', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { category: { findFirst } } as unknown as PrismaTx;
    const repository = createRepository(
      createPrismaService({ findFirst: vi.fn() }),
    );

    await repository.findByIdInOrganization(CATEGORY_ID, OTHER_ORG_ID, tx);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID, organizationId: OTHER_ORG_ID },
    });
  });

  it('deletes by id', async () => {
    const remove = vi.fn().mockResolvedValue({});
    const repository = createRepository(
      createPrismaService({ delete: remove }),
    );

    await repository.delete(CATEGORY_ID);

    expect(remove).toHaveBeenCalledWith({ where: { id: CATEGORY_ID } });
  });
});
