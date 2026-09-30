import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import { PrismaBrandRepository } from './prisma-brand.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const BRAND_ID = '33333333-3333-4333-8333-333333333333';

type BrandDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createRepository(overrides: Partial<BrandDelegate> = {}) {
  const brand: BrandDelegate = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: BRAND_ID }),
    update: vi.fn().mockResolvedValue({ id: BRAND_ID }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const prisma = { client: { brand } } as unknown as PrismaService;
  return { repository: new PrismaBrandRepository(prisma), brand, prisma };
}

describe('PrismaBrandRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always scopes a lookup by id to the organization', async () => {
    const { repository, brand } = createRepository();

    await repository.findByIdInOrganization(BRAND_ID, ORG_ID);

    expect(brand.findFirst).toHaveBeenCalledWith({
      where: { id: BRAND_ID, organizationId: ORG_ID },
    });
  });

  it('always scopes a name lookup to the organization', async () => {
    const { repository, brand } = createRepository();

    await repository.findByName('Everest Foods', ORG_ID);

    expect(brand.findFirst).toHaveBeenCalledWith({
      where: { name: 'Everest Foods', organizationId: ORG_ID },
    });
  });

  it('constrains the list to the organization and counts the same set', async () => {
    const { repository, brand } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(brand.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG_ID,
    });
    expect(brand.count).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
    });
  });

  it('applies the search filter case-insensitively', async () => {
    const { repository, brand } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, search: 'everest' },
      ORG_ID,
    );

    expect(brand.findMany.mock.calls[0][0].where.name).toEqual({
      contains: 'everest',
      mode: 'insensitive',
    });
  });

  it('applies the status filter', async () => {
    const { repository, brand } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, status: 'inactive' },
      ORG_ID,
    );

    expect(brand.findMany.mock.calls[0][0].where.status).toBe('inactive');
  });

  it('paginates with skip and take derived from page and limit', async () => {
    const { repository, brand } = createRepository();

    await repository.findAllInOrganization({ page: 3, limit: 5 }, ORG_ID);

    expect(brand.findMany.mock.calls[0][0]).toMatchObject({
      skip: 10,
      take: 5,
    });
  });

  it('rejects a sort column outside the allow-list', async () => {
    const { repository, brand } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'organizationId' },
      ORG_ID,
    );

    // organizationId is a real column but is not sortable by a client, so the
    // query must fall back to the default rather than leaking cross-tenant order.
    expect(brand.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('sorts by an allow-listed column', async () => {
    const { repository, brand } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' },
      ORG_ID,
    );

    expect(brand.findMany.mock.calls[0][0].orderBy).toEqual({ name: 'asc' });
  });

  it('returns the product reference count with each row', async () => {
    const { repository, brand } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(brand.findMany.mock.calls[0][0].include).toEqual({
      _count: { select: { products: true } },
    });
  });

  it('computes totalPages from the organization total', async () => {
    const { repository } = createRepository({
      findMany: vi.fn().mockResolvedValue([{}, {}]),
      count: vi.fn().mockResolvedValue(5),
    });

    const page = await repository.findAllInOrganization(
      { page: 1, limit: 2 },
      ORG_ID,
    );

    expect(page).toMatchObject({ total: 5, limit: 2, totalPages: 3 });
  });

  it('uses the supplied transaction instead of the shared client', async () => {
    const tx = {
      brand: { create: vi.fn().mockResolvedValue({ id: BRAND_ID }) },
    };
    const { repository, brand } = createRepository();

    await repository.create(
      { name: 'Everest Foods' },
      tx as unknown as PrismaTx,
    );

    expect(tx.brand.create).toHaveBeenCalled();
    expect(brand.create).not.toHaveBeenCalled();
  });
});
