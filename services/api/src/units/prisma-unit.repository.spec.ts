import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import { PrismaUnitRepository } from './prisma-unit.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const UNIT_ID = '33333333-3333-4333-8333-333333333333';

type UnitDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createRepository(overrides: Partial<UnitDelegate> = {}) {
  const unit: UnitDelegate = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: UNIT_ID }),
    update: vi.fn().mockResolvedValue({ id: UNIT_ID }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const prisma = { client: { unit } } as unknown as PrismaService;
  return { repository: new PrismaUnitRepository(prisma), unit, prisma };
}

describe('PrismaUnitRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always scopes a lookup by id to the organization', async () => {
    const { repository, unit } = createRepository();

    await repository.findByIdInOrganization(UNIT_ID, ORG_ID);

    expect(unit.findFirst).toHaveBeenCalledWith({
      where: { id: UNIT_ID, organizationId: ORG_ID },
    });
  });

  it('scopes a code lookup to the organization', async () => {
    const { repository, unit } = createRepository();

    await repository.findByCode('KG', ORG_ID);

    expect(unit.findFirst).toHaveBeenCalledWith({
      where: { code: 'KG', organizationId: ORG_ID },
    });
  });

  it('constrains the list to the organization and counts the same set', async () => {
    const { repository, unit } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(unit.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG_ID,
    });
    expect(unit.count).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
    });
  });

  it('searches both the name and the code', async () => {
    const { repository, unit } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, search: 'kg' },
      ORG_ID,
    );

    const where = unit.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'kg', mode: 'insensitive' } },
      { code: { contains: 'kg', mode: 'insensitive' } },
    ]);
  });

  it('applies the status filter', async () => {
    const { repository, unit } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, status: 'inactive' },
      ORG_ID,
    );

    expect(unit.findMany.mock.calls[0][0].where.status).toBe('inactive');
  });

  it('paginates with skip and take derived from page and limit', async () => {
    const { repository, unit } = createRepository();

    await repository.findAllInOrganization({ page: 3, limit: 5 }, ORG_ID);

    expect(unit.findMany.mock.calls[0][0]).toMatchObject({
      skip: 10,
      take: 5,
    });
  });

  it('rejects a sort column outside the allow-list', async () => {
    const { repository, unit } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'organizationId' },
      ORG_ID,
    );

    // organizationId is a real column but is not client-sortable, so the query
    // must fall back to the default rather than leaking cross-tenant order.
    expect(unit.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('sorts by an allow-listed column', async () => {
    const { repository, unit } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'code', sortOrder: 'asc' },
      ORG_ID,
    );

    expect(unit.findMany.mock.calls[0][0].orderBy).toEqual({ code: 'asc' });
  });

  it('returns the product and conversion reference counts with each row', async () => {
    const { repository, unit } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(unit.findMany.mock.calls[0][0].include).toEqual({
      _count: {
        select: { products: true, conversionsFrom: true, conversionsTo: true },
      },
    });
  });

  it('computes totalPages from the organization total', async () => {
    const { repository } = createRepository({
      findMany: vi.fn().mockResolvedValue([{}, {}]),
      count: vi.fn().mockResolvedValue(7),
    });

    const page = await repository.findAllInOrganization(
      { page: 1, limit: 2 },
      ORG_ID,
    );

    expect(page).toMatchObject({ total: 7, limit: 2, totalPages: 4 });
  });

  it('uses the supplied transaction instead of the shared client', async () => {
    const tx = { unit: { create: vi.fn().mockResolvedValue({ id: UNIT_ID }) } };
    const { repository, unit } = createRepository();

    await repository.create(
      { name: 'Kilogram', code: 'KG', precision: 3 },
      tx as unknown as PrismaTx,
    );

    expect(tx.unit.create).toHaveBeenCalled();
    expect(unit.create).not.toHaveBeenCalled();
  });
});
