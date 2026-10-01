import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import { PrismaPriceRepository } from './prisma-price.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const PRICE_ID = '44444444-4444-4444-8444-444444444444';

const d = (iso: string) => new Date(iso);

/** A candidate row as Prisma returns it, so the overlap test sees real Dates. */
function row(
  from: string,
  to: string | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: PRICE_ID,
    productId: PRODUCT_ID,
    priceType: 'retail',
    amount: '150',
    effectiveFrom: d(from),
    effectiveTo: to === null ? null : d(to),
    createdAt: d(from),
    updatedAt: d(from),
    ...overrides,
  };
}

type PriceDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createRepository(
  overrides: Partial<PriceDelegate> = {},
  prismaOverrides: Record<string, unknown> = {},
) {
  const productPrice: PriceDelegate = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: PRICE_ID }),
    update: vi.fn().mockResolvedValue({ id: PRICE_ID }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const prisma = {
    client: { productPrice },
    ...prismaOverrides,
  } as unknown as PrismaService;
  return {
    repository: new PrismaPriceRepository(prisma),
    productPrice,
    prisma,
  };
}

describe('PrismaPriceRepository tenant scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes a lookup by id to the parent product organization', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findByIdInProduct(PRICE_ID, PRODUCT_ID, ORG_ID);

    // `product_prices` has no organization column, so the tenant predicate has to
    // travel through the product relation.
    expect(productPrice.findFirst).toHaveBeenCalledWith({
      where: {
        id: PRICE_ID,
        productId: PRODUCT_ID,
        product: { organizationId: ORG_ID },
      },
    });
  });

  it('constrains the listing to the product and the caller organization', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findAllForProduct({
      productId: PRODUCT_ID,
      organizationId: ORG_ID,
    });

    expect(productPrice.findMany.mock.calls[0][0].where).toMatchObject({
      productId: PRODUCT_ID,
      product: { organizationId: ORG_ID },
    });
  });

  it('adds no window predicate when effectiveOn is absent', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findAllForProduct({
      productId: PRODUCT_ID,
      organizationId: ORG_ID,
    });

    const where = productPrice.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
  });

  it('applies the half-open interval test for effectiveOn', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findAllForProduct({
      productId: PRODUCT_ID,
      organizationId: ORG_ID,
      effectiveOn: d('2026-06-15T00:00:00.000Z'),
    });

    const where = productPrice.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { effectiveFrom: { lte: d('2026-06-15T00:00:00.000Z') } },
      {
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: d('2026-06-15T00:00:00.000Z') } },
        ],
      },
    ]);
  });

  it('filters by price type only when one is supplied', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findAllForProduct({
      productId: PRODUCT_ID,
      organizationId: ORG_ID,
    });
    expect(
      productPrice.findMany.mock.calls[0][0].where.priceType,
    ).toBeUndefined();

    await repository.findAllForProduct({
      productId: PRODUCT_ID,
      organizationId: ORG_ID,
      priceType: 'wholesale',
    });
    expect(productPrice.findMany.mock.calls[1][0].where.priceType).toBe(
      'wholesale',
    );
  });

  it('sorts from the allow-listed field with a stable tiebreak', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findAllForProduct({
      productId: PRODUCT_ID,
      organizationId: ORG_ID,
    });

    expect(productPrice.findMany.mock.calls[0][0].orderBy).toEqual([
      { effectiveFrom: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('honours an explicit sort order and window', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findAllForProduct({
      productId: PRODUCT_ID,
      organizationId: ORG_ID,
      orderBy: 'createdAt',
      orderDir: 'asc',
      take: 10,
      skip: 30,
    });

    expect(productPrice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 30 }),
    );
    expect(productPrice.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'asc' },
      { createdAt: 'desc' },
    ]);
  });
});

describe('PrismaPriceRepository overlap detection', () => {
  beforeEach(() => vi.clearAllMocks());

  /** Runs the repository against a fixed set of existing periods. */
  async function overlaps(
    existing: ReturnType<typeof row>[],
    from: string,
    to: string | null,
    excludeId?: string,
  ) {
    const { repository } = createRepository({
      findMany: vi.fn().mockResolvedValue(existing),
    });
    const result = await repository.findOverlappingForType(
      PRODUCT_ID,
      'retail',
      d(from),
      to === null ? null : d(to),
      excludeId,
    );
    return result.map((r) => r.id);
  }

  it('reads candidates only for the same product and price type', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findOverlappingForType(
      PRODUCT_ID,
      'retail',
      d('2026-01-01T00:00:00.000Z'),
      null,
      undefined,
    );

    expect(productPrice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: PRODUCT_ID, priceType: 'retail' },
      }),
    );
  });

  it('excludes the row being edited from the candidate set', async () => {
    const { repository, productPrice } = createRepository();

    await repository.findOverlappingForType(
      PRODUCT_ID,
      'retail',
      d('2026-01-01T00:00:00.000Z'),
      null,
      PRICE_ID,
    );

    expect(productPrice.findMany.mock.calls[0][0].where).toMatchObject({
      id: { not: PRICE_ID },
    });
  });

  it('reports no overlap for a fully disjoint earlier period', async () => {
    expect(
      await overlaps(
        [row('2020-01-01T00:00:00.000Z', '2021-01-01T00:00:00.000Z')],
        '2026-01-01T00:00:00.000Z',
        null,
      ),
    ).toEqual([]);
  });

  it('reports an overlap between an open-ended new period and a later bounded one', async () => {
    // There is no way for a new open-ended period to be disjoint from anything
    // else in its series, because it claims every instant after its start. This is
    // the reason a price change retires the outgoing period and inserts the
    // successor in the same breath, rather than simply inserting a successor.
    expect(
      await overlaps(
        [row('2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z')],
        '2026-01-01T00:00:00.000Z',
        null,
      ),
    ).toEqual([PRICE_ID]);
  });

  it('detects a new open-ended period over an open-ended one', async () => {
    expect(
      await overlaps(
        [row('2020-01-01T00:00:00.000Z', null)],
        '2026-01-01T00:00:00.000Z',
        null,
      ),
    ).toEqual([PRICE_ID]);
  });

  it('detects a new open-ended period starting inside an existing one', async () => {
    expect(
      await overlaps(
        [row('2020-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')],
        '2026-01-01T00:00:00.000Z',
        null,
      ),
    ).toEqual([PRICE_ID]);
  });

  it('detects a new open-ended period swallowing an existing one', async () => {
    expect(
      await overlaps(
        [row('2026-06-01T00:00:00.000Z', null)],
        '2026-01-01T00:00:00.000Z',
        null,
      ),
    ).toEqual([PRICE_ID]);
  });

  it('reports no overlap when a successor starts exactly where the candidate ends', async () => {
    // The half-open interval is what makes retiring a price at the instant its
    // successor begins a legal transition rather than a conflict.
    expect(
      await overlaps(
        [row('2026-01-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')],
        '2026-07-01T00:00:00.000Z',
        null,
      ),
    ).toEqual([]);
  });

  it('reports no overlap when a candidate ends exactly where a successor starts', async () => {
    expect(
      await overlaps(
        [row('2026-07-01T00:00:00.000Z', null)],
        '2026-01-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      ),
    ).toEqual([]);
  });

  it('reports no overlap for two adjacent bounded windows', async () => {
    expect(
      await overlaps(
        [row('2026-01-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')],
        '2026-07-01T00:00:00.000Z',
        '2027-01-01T00:00:00.000Z',
      ),
    ).toEqual([]);
  });

  it('detects a partial overlap at the start of a bounded window', async () => {
    expect(
      await overlaps(
        [row('2026-03-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')],
        '2026-01-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      ),
    ).toEqual([PRICE_ID]);
  });

  it('detects a partial overlap at the end of a bounded window', async () => {
    expect(
      await overlaps(
        [row('2020-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')],
        '2026-01-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      ),
    ).toEqual([PRICE_ID]);
  });

  it('detects a bounded window fully inside an open-ended one', async () => {
    expect(
      await overlaps(
        [row('2020-01-01T00:00:00.000Z', null)],
        '2026-01-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      ),
    ).toEqual([PRICE_ID]);
  });

  it('detects an open-ended candidate reached by an existing bounded window', async () => {
    expect(
      await overlaps(
        [row('2020-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')],
        '2026-06-01T00:00:00.000Z',
        null,
      ),
    ).toEqual([PRICE_ID]);
  });

  it('detects an overlap between two bounded windows', async () => {
    expect(
      await overlaps(
        [row('2026-01-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')],
        '2026-06-01T00:00:00.000Z',
        '2027-01-01T00:00:00.000Z',
      ),
    ).toEqual([PRICE_ID]);
  });

  it('reports no overlap against an identical window when that row is excluded', async () => {
    // The exclusion is expressed in the `where` clause, so the row never reaches
    // the filter at all. This is asserted against the clause rather than against
    // the returned array, because a mocked delegate does not apply it.
    const { repository, productPrice } = createRepository({
      findMany: vi.fn().mockResolvedValue([]),
    });

    await repository.findOverlappingForType(
      PRODUCT_ID,
      'retail',
      d('2026-01-01T00:00:00.000Z'),
      null,
      'other',
    );

    expect(productPrice.findMany.mock.calls[0][0].where.id).toEqual({
      not: 'other',
    });
  });
});

describe('PrismaPriceRepository writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts the amount as a decimal, not a float', async () => {
    const { repository, productPrice } = createRepository();

    await repository.create({
      productId: PRODUCT_ID,
      priceType: 'retail',
      amount: '150.00',
      effectiveFrom: d('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    });

    const data = productPrice.create.mock.calls[0][0].data;
    expect(data.amount).not.toBe(150);
    expect(data.amount.toString()).toBe('150');
  });

  it('writes a null effectiveTo for an open-ended price', async () => {
    const { repository, productPrice } = createRepository();

    await repository.create({
      productId: PRODUCT_ID,
      priceType: 'retail',
      amount: '150.00',
      effectiveFrom: d('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    });

    expect(productPrice.create.mock.calls[0][0].data.effectiveTo).toBeNull();
  });

  it('never writes an organizationId, because the table has no such column', async () => {
    const { repository, productPrice } = createRepository();

    await repository.create({
      productId: PRODUCT_ID,
      priceType: 'retail',
      amount: '150.00',
      effectiveFrom: d('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    });

    expect(productPrice.create.mock.calls[0][0].data).not.toHaveProperty(
      'organizationId',
    );
  });

  it('updates only effectiveTo, so the immutable fields cannot be reached', async () => {
    const { repository, productPrice } = createRepository();

    await repository.update(PRICE_ID, {
      effectiveTo: d('2026-07-01T00:00:00.000Z'),
    });

    const data = productPrice.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['effectiveTo']);
  });

  it('writes an explicit null effectiveTo through on reopen', async () => {
    const { repository, productPrice } = createRepository();

    await repository.update(PRICE_ID, { effectiveTo: null });

    expect(productPrice.update.mock.calls[0][0].data).toEqual({
      effectiveTo: null,
    });
  });

  it('issues an empty update rather than one with no fields', async () => {
    const { repository, productPrice } = createRepository();

    await repository.update(PRICE_ID, {});

    expect(productPrice.update.mock.calls[0][0].data).toEqual({});
  });

  it('uses the transaction handle when one is supplied', async () => {
    const tx = {
      productPrice: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaTx;
    const { repository, productPrice } = createRepository();

    await repository.findByIdInProduct(PRICE_ID, PRODUCT_ID, ORG_ID, tx);

    expect(tx.productPrice.findFirst).toHaveBeenCalled();
    expect(productPrice.findFirst).not.toHaveBeenCalled();
  });
});
