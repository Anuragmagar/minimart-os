import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import { PrismaUnitConversionRepository } from './prisma-unit-conversion.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSION_ID = '33333333-3333-4333-8333-333333333333';
const DOZ = '55555555-5555-4555-8555-555555555555';
const PCS = '66666666-6666-4666-8666-666666666666';
const BOX = '77777777-7777-4777-8777-777777777777';

type Delegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createRepository(overrides: Partial<Delegate> = {}) {
  const unitConversion: Delegate = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
    update: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const prisma = { client: { unitConversion } } as unknown as PrismaService;
  return {
    repository: new PrismaUnitConversionRepository(prisma),
    unitConversion,
  };
}

describe('PrismaUnitConversionRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always scopes a lookup by id to the organization', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findByIdInOrganization(CONVERSION_ID, ORG_ID);

    expect(unitConversion.findFirst).toHaveBeenCalledWith({
      where: { id: CONVERSION_ID, organizationId: ORG_ID },
    });
  });

  it('scopes a direction lookup to the organization', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findByDirection(DOZ, PCS, ORG_ID);

    expect(unitConversion.findFirst).toHaveBeenCalledWith({
      where: { fromUnitId: DOZ, toUnitId: PCS, organizationId: ORG_ID },
    });
  });

  it('constrains the list to the organization and counts the same set', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(unitConversion.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG_ID,
    });
    expect(unitConversion.count).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
    });
  });

  it('filters by source unit', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, fromUnitId: DOZ },
      ORG_ID,
    );

    const where = unitConversion.findMany.mock.calls[0][0].where;
    expect(where.fromUnitId).toBe(DOZ);
    expect(where.toUnitId).toBeUndefined();
  });

  it('filters by target unit', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, toUnitId: PCS },
      ORG_ID,
    );

    expect(unitConversion.findMany.mock.calls[0][0].where.toUnitId).toBe(PCS);
  });

  it('paginates with skip and take derived from page and limit', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization({ page: 4, limit: 5 }, ORG_ID);

    expect(unitConversion.findMany.mock.calls[0][0]).toMatchObject({
      skip: 15,
      take: 5,
    });
  });

  it('joins both endpoint units so a row renders without a second request', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    const include = unitConversion.findMany.mock.calls[0][0].include;
    expect(Object.keys(include).sort()).toEqual(['fromUnit', 'toUnit']);
    expect(include.fromUnit.select).toMatchObject({
      code: true,
      name: true,
      precision: true,
    });
  });

  it('rejects a sort column outside the allow-list', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'organizationId' },
      ORG_ID,
    );

    // organizationId is a real column but is not client-sortable, so the query
    // must fall back to the default rather than leaking cross-tenant order.
    expect(unitConversion.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('rejects sorting by a unit column, which the join does not order by', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'fromUnitId' },
      ORG_ID,
    );

    expect(unitConversion.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('sorts by an allow-listed column', async () => {
    const { repository, unitConversion } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'multiplier', sortOrder: 'asc' },
      ORG_ID,
    );

    expect(unitConversion.findMany.mock.calls[0][0].orderBy).toEqual({
      multiplier: 'asc',
    });
  });

  it('computes totalPages from the organization total', async () => {
    const { repository } = createRepository({
      findMany: vi.fn().mockResolvedValue([{}]),
      count: vi.fn().mockResolvedValue(5),
    });

    const page = await repository.findAllInOrganization(
      { page: 1, limit: 2 },
      ORG_ID,
    );

    expect(page).toMatchObject({ total: 5, limit: 2, totalPages: 3 });
  });

  it('returns both ends of each outgoing edge, scoped to the organization', async () => {
    const { repository, unitConversion } = createRepository({
      findMany: vi.fn().mockResolvedValue([
        { fromUnitId: DOZ, toUnitId: PCS },
        { fromUnitId: BOX, toUnitId: PCS },
      ]),
    });

    const edges = await repository.findOutgoingEdges([DOZ, BOX], ORG_ID);

    expect(unitConversion.findMany).toHaveBeenCalledWith({
      where: { fromUnitId: { in: [DOZ, BOX] }, organizationId: ORG_ID },
      select: { fromUnitId: true, toUnitId: true },
    });
    expect(edges).toEqual([
      { fromUnitId: DOZ, toUnitId: PCS },
      { fromUnitId: BOX, toUnitId: PCS },
    ]);
  });

  it('skips the query entirely when there is nothing to expand', async () => {
    const { repository, unitConversion } = createRepository();

    expect(await repository.findOutgoingEdges([], ORG_ID)).toEqual([]);
    expect(unitConversion.findMany).not.toHaveBeenCalled();
  });

  it('uses the supplied transaction instead of the shared client', async () => {
    const tx = {
      unitConversion: {
        create: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
      },
    };
    const { repository, unitConversion } = createRepository();

    await repository.create(
      {
        organizationId: ORG_ID,
        fromUnitId: DOZ,
        toUnitId: PCS,
        multiplier: '12',
      },
      tx as unknown as PrismaTx,
    );

    expect(tx.unitConversion.create).toHaveBeenCalled();
    expect(unitConversion.create).not.toHaveBeenCalled();
  });
});
