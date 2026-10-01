import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import { PrismaProductRepository } from './prisma-product.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

type ProductDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createRepository(overrides: Partial<ProductDelegate> = {}) {
  const product: ProductDelegate = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: PRODUCT_ID }),
    update: vi.fn().mockResolvedValue({ id: PRODUCT_ID }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const prisma = { client: { product } } as unknown as PrismaService;
  return { repository: new PrismaProductRepository(prisma), product, prisma };
}

describe('PrismaProductRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always scopes a lookup by id to the organization', async () => {
    const { repository, product } = createRepository();

    await repository.findByIdInOrganization(PRODUCT_ID, ORG_ID);

    expect(product.findFirst).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, organizationId: ORG_ID },
    });
  });

  it('scopes a SKU lookup to the organization', async () => {
    const { repository, product } = createRepository();

    await repository.findBySku('COK-500', ORG_ID);

    expect(product.findFirst).toHaveBeenCalledWith({
      where: { sku: 'COK-500', organizationId: ORG_ID },
    });
  });

  it('constrains the list to the organization and counts the same set', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(product.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG_ID,
    });
    expect(product.count).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
    });
  });

  it('searches both the name and the SKU', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, search: 'cok' },
      ORG_ID,
    );

    const where = product.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'cok', mode: 'insensitive' } },
      { sku: { contains: 'cok', mode: 'insensitive' } },
    ]);
  });

  it('applies the status filter', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, status: 'inactive' },
      ORG_ID,
    );

    expect(product.findMany.mock.calls[0][0].where.status).toBe('inactive');
  });

  it('paginates with skip and take derived from page and limit', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization({ page: 3, limit: 5 }, ORG_ID);

    expect(product.findMany.mock.calls[0][0]).toMatchObject({
      skip: 10,
      take: 5,
    });
  });

  it('rejects a sort column outside the allow-list', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'organizationId' },
      ORG_ID,
    );

    // organizationId is a real column but is not client-sortable, so the query
    // must fall back to the default rather than leaking cross-tenant order.
    expect(product.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('rejects a price column as a sort key because the column is a decimal', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'defaultSellingPrice' },
      ORG_ID,
    );

    expect(product.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('sorts by an allow-listed column', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'sku', sortOrder: 'asc' },
      ORG_ID,
    );

    expect(product.findMany.mock.calls[0][0].orderBy).toEqual({ sku: 'asc' });
  });

  it('defaults to newest first', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization({}, ORG_ID);

    expect(product.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('joins the four parents with display fields only', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(product.findMany.mock.calls[0][0].include).toEqual({
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      unit: { select: { id: true, code: true, precision: true } },
      taxCategory: { select: { id: true, code: true, name: true } },
    });
  });

  it('never joins a tax rate or an inventory quantity onto a product row', async () => {
    const { repository, product } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    const include = JSON.stringify(product.findMany.mock.calls[0][0].include);
    // The tax rate is owned by Task 05.07 and inventory is a ledger projection
    // that must never be read off a product row.
    expect(include).not.toContain('rate');
    expect(include).not.toContain('quantity');
  });

  it('reports the page metadata alongside the rows', async () => {
    const { repository } = createRepository({
      findMany: vi.fn().mockResolvedValue([{ id: PRODUCT_ID }]),
      count: vi.fn().mockResolvedValue(45),
    });

    const page = await repository.findAllInOrganization(
      { page: 2, limit: 20 },
      ORG_ID,
    );

    expect(page).toEqual({
      data: [{ id: PRODUCT_ID }],
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
    });
  });

  it('creates through the transaction client when one is supplied', async () => {
    const { repository, product } = createRepository();
    const tx = { product } as unknown as PrismaTx;

    await repository.create({ sku: 'COK-500' }, tx);

    expect(product.create).toHaveBeenCalledWith({
      data: { sku: 'COK-500' },
    });
  });

  it('updates by id only, leaving tenant scoping to the service', async () => {
    const { repository, product } = createRepository();

    await repository.update(PRODUCT_ID, { name: 'Renamed' });

    expect(product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: { name: 'Renamed' },
    });
  });

  it('deletes by id', async () => {
    const { repository, product } = createRepository();

    await repository.delete(PRODUCT_ID);

    expect(product.delete).toHaveBeenCalledWith({ where: { id: PRODUCT_ID } });
  });
});
