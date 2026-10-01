import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import { PrismaTaxCategoryRepository } from './prisma-tax-category.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TAX_ID = '33333333-3333-4333-8333-333333333333';

type TaxCategoryDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createRepository(overrides: Partial<TaxCategoryDelegate> = {}) {
  const taxCategory: TaxCategoryDelegate = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: TAX_ID }),
    update: vi.fn().mockResolvedValue({ id: TAX_ID }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const prisma = { client: { taxCategory } } as unknown as PrismaService;
  return { repository: new PrismaTaxCategoryRepository(prisma), taxCategory };
}

describe('PrismaTaxCategoryRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always scopes a lookup by id to the organization', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findByIdInOrganization(TAX_ID, ORG_ID);

    expect(taxCategory.findFirst).toHaveBeenCalledWith({
      where: { id: TAX_ID, organizationId: ORG_ID },
    });
  });

  it('scopes a code lookup to the organization and carries no product filter', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findByCode('VAT-STD', ORG_ID);

    // The unique key is (organizationId, code), so the conflicting row may
    // belong to any product in the organization. Adding a product predicate here
    // would let the same code be created twice under two products.
    expect(taxCategory.findFirst).toHaveBeenCalledWith({
      where: { code: 'VAT-STD', organizationId: ORG_ID },
    });
  });

  it('constrains the list to the organization and counts the same set', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(taxCategory.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG_ID,
    });
    expect(taxCategory.count).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
    });
  });

  it('searches both the name and the code', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, search: 'vat' },
      ORG_ID,
    );

    const where = taxCategory.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'vat', mode: 'insensitive' } },
      { code: { contains: 'vat', mode: 'insensitive' } },
    ]);
  });

  it('applies the status filter', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, status: 'inactive' },
      ORG_ID,
    );

    expect(taxCategory.findMany.mock.calls[0][0].where.status).toBe('inactive');
  });

  it('paginates with skip and take derived from page and limit', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization({ page: 3, limit: 5 }, ORG_ID);

    expect(taxCategory.findMany.mock.calls[0][0]).toMatchObject({
      skip: 10,
      take: 5,
    });
  });

  it('rejects a sort column outside the allow-list', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'organizationId' },
      ORG_ID,
    );

    // organizationId is a real column but is not client-sortable, so the query
    // must fall back to the default rather than leaking cross-tenant order.
    expect(taxCategory.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('rejects the rate as a sort column, because NUMERIC ordering is not a documented listing', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'rate' },
      ORG_ID,
    );

    expect(taxCategory.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('sorts by an allow-listed column', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization(
      { page: 1, limit: 20, sortBy: 'effectiveFrom', sortOrder: 'asc' },
      ORG_ID,
    );

    expect(taxCategory.findMany.mock.calls[0][0].orderBy).toEqual({
      effectiveFrom: 'asc',
    });
  });

  it('returns the product reference count with each row', async () => {
    const { repository, taxCategory } = createRepository();

    await repository.findAllInOrganization({ page: 1, limit: 20 }, ORG_ID);

    expect(taxCategory.findMany.mock.calls[0][0].include).toEqual({
      _count: { select: { products: true } },
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
    const tx = {
      taxCategory: { create: vi.fn().mockResolvedValue({ id: TAX_ID }) },
    };
    const { repository, taxCategory } = createRepository();

    await repository.create(
      { name: 'VAT Standard Rate', code: 'VAT-STD', rate: '13.0000' },
      tx as unknown as PrismaTx,
    );

    expect(tx.taxCategory.create).toHaveBeenCalled();
    expect(taxCategory.create).not.toHaveBeenCalled();
  });
});
