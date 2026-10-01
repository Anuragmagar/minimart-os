import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  PrismaService,
  PrismaTx,
} from '../../src/database/prisma.service.js';
import type { TenantContext } from '../../src/common/auth/authenticated-user.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import { PrismaPriceRepository } from '../../src/prices/prisma-price.repository.js';
import { PrismaProductRepository } from '../../src/products/prisma-product.repository.js';
import { PriceService } from '../../src/prices/price.service.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;
let prismaService: PrismaService;
let priceService: PriceService;
let productRepository: PrismaProductRepository;

let orgA: { id: string };
let orgB: { id: string };
let ctxA: TenantContext;
let ctxB: TenantContext;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  // The repository reaches the database through PrismaService rather than a raw
  // client, and the overlap check and the insert have to share one transaction,
  // so the service is assembled by hand over a genuine `$transaction`.
  prismaService = {
    client: prisma,
    runInTransaction: <T>(fn: (tx: PrismaTx) => Promise<T>) =>
      prisma.$transaction((tx) => fn(tx as unknown as PrismaTx)),
  } as unknown as PrismaService;

  const auditService = new AuditService(
    new PrismaAuditRepository(prismaService),
  );
  productRepository = new PrismaProductRepository(prismaService);
  priceService = new PriceService(
    new PrismaPriceRepository(prismaService),
    productRepository,
    prismaService,
    auditService,
  );

  orgA = await prisma.organization.create({
    data: {
      name: 'Price Svc Org A',
      legalName: 'A Pvt Ltd',
      currency: 'NPR',
    },
  });
  orgB = await prisma.organization.create({
    data: {
      name: 'Price Svc Org B',
      legalName: 'B Pvt Ltd',
      currency: 'NPR',
    },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: orgA.id,
      email: 'price-service@example.com',
      passwordHash: 'not-a-real-hash',
      name: 'Price Service Tester',
    },
  });
  ctxA = {
    organizationId: orgA.id,
    userId: user.id,
    storeId: null,
    permissions: [],
  };
  ctxB = {
    organizationId: orgB.id,
    userId: user.id,
    storeId: null,
    permissions: [],
  };
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.auditLog.deleteMany({});
  // Prices are RESTRICT from the product, so they go first.
  await prisma.productPrice.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

function suffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

const FROM = '2026-01-01T00:00:00.000Z';
const TO = '2026-07-01T00:00:00.000Z';

type CreatedPrice = {
  id: string;
  productId: string;
  priceType: string;
  amount: { toString(): string };
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

/** Every test gets its own product, so the overlap rule never leaks between them. */
async function makeProduct(ctx: TenantContext): Promise<{ id: string }> {
  const s = suffix();
  return prisma.product.create({
    data: {
      organizationId: ctx.organizationId,
      name: `Product ${s}`,
      sku: `SKU-${s}`,
      status: 'active',
    },
    select: { id: true },
  });
}

async function makePrice(
  ctx: TenantContext,
  overrides: Record<string, unknown> = {},
): Promise<CreatedPrice> {
  const product = await makeProduct(ctx);
  return (await prisma.productPrice.create({
    data: {
      productId: product.id,
      priceType: 'retail',
      amount: '100',
      effectiveFrom: new Date(FROM),
      ...overrides,
    },
  })) as unknown as CreatedPrice;
}

describe('PriceService against PostgreSQL', () => {
  it('stores the amount in NUMERIC(14,2) without losing the value', async () => {
    const product = await makeProduct(ctxA);

    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '150.55',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;

    // 150.55 is exactly representable at two decimals, so a float round trip
    // would show up here as 150.54999999.
    expect(row.amount.toString()).toBe('150.55');
    expect(row.effectiveFrom.toISOString()).toBe(FROM);
    expect(row.effectiveTo).toBeNull();
  });

  it('stores a zero price, the free-line case', async () => {
    const product = await makeProduct(ctxA);

    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '0',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;
    expect(row.amount.toString()).toBe('0');
  });

  it('stores a price at the largest value the column accepts', async () => {
    const product = await makeProduct(ctxA);

    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'bulk',
      amount: '999999999999.99',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;
    // NUMERIC(14,2) allows 12 integer digits, and nothing narrows that.
    expect(row.amount.toString()).toBe('999999999999.99');
  });

  it('stores a future effective start, because a price may be scheduled', async () => {
    const product = await makeProduct(ctxA);
    const future = '2099-01-01T00:00:00.000Z';

    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: future,
    })) as CreatedPrice;

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;
    expect(row.effectiveFrom.toISOString()).toBe(future);
  });

  it('keeps the tenant out of the price row and reaches it through the product', async () => {
    const product = await makeProduct(ctxA);

    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
      include: { product: { select: { organizationId: true } } },
    })) as unknown as { product: { organizationId: string } };

    // `product_prices` has no organization column, so the tenant is reached
    // through the product. This is the only way the isolation can hold.
    expect(row.product.organizationId).toBe(orgA.id);
  });

  it('rejects a period that overlaps an existing one of the same price type', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
      effectiveTo: TO,
    });

    await expect(
      priceService.create(ctxA, product.id, {
        priceType: 'retail',
        amount: '120',
        effectiveFrom: '2026-04-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // The check runs inside the write transaction, so the rejected insert left
    // nothing behind.
    expect(
      await prisma.productPrice.count({ where: { productId: product.id } }),
    ).toBe(1);
  });

  it('rejects an earlier open-ended period that would swallow the current one', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    });

    // Back-dating a second open-ended period would claim instants the current one
    // already holds, and both would be open ends, so the price after 2026 would
    // have no single answer.
    await expect(
      priceService.create(ctxA, product.id, {
        priceType: 'retail',
        amount: '90',
        effectiveFrom: '2025-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a back-dated period that ends before the current one starts', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    });

    // A bounded window entirely before the open-ended one is disjoint, so a
    // back-dated correction is still possible.
    const earlier = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '90',
      effectiveFrom: '2025-01-01T00:00:00.000Z',
      effectiveTo: '2025-06-01T00:00:00.000Z',
    })) as CreatedPrice;

    expect(earlier.amount.toString()).toBe('90');
    expect(
      await prisma.productPrice.count({ where: { productId: product.id } }),
    ).toBe(2);
  });

  it('allows a successor that starts exactly where the outgoing period ends', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
      effectiveTo: TO,
    });

    const successor = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '120',
      effectiveFrom: TO,
    })) as CreatedPrice;

    expect(successor.amount.toString()).toBe('120');
    expect(
      await prisma.productPrice.count({ where: { productId: product.id } }),
    ).toBe(2);
  });

  it('allows the same window in a different price type', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    });

    await priceService.create(ctxA, product.id, {
      priceType: 'wholesale',
      amount: '80',
      effectiveFrom: FROM,
    });

    // Overlap is scoped to (product, price type), so a wholesale and a retail
    // price for the same product are two independent series.
    expect(
      await prisma.productPrice.count({ where: { productId: product.id } }),
    ).toBe(2);
  });

  it('allows an overlapping window on a different product', async () => {
    const first = await makeProduct(ctxA);
    const second = await makeProduct(ctxA);
    await priceService.create(ctxA, first.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    });

    await priceService.create(ctxA, second.id, {
      priceType: 'retail',
      amount: '200',
      effectiveFrom: FROM,
    });

    expect(
      await prisma.productPrice.count({
        where: { productId: { in: [first.id, second.id] } },
      }),
    ).toBe(2);
  });

  it('retires a period and leaves the amount and the start untouched', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    const updated = (await priceService.update(ctxA, product.id, created.id, {
      effectiveTo: TO,
    })) as CreatedPrice;

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;

    expect(row.effectiveTo?.toISOString()).toBe(TO);
    // A retired period still records what the price was, so neither the amount
    // nor the start may move.
    expect(row.amount.toString()).toBe('100');
    expect(row.effectiveFrom.toISOString()).toBe(FROM);
    expect(updated.id).toBe(created.id);
  });

  it('rejects a retirement that would overlap the successor', async () => {
    const product = await makeProduct(ctxA);
    const first = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    // The outgoing period is closed first, because an open-ended period and its
    // successor cannot both exist: that is the whole point of the overlap rule.
    await priceService.update(ctxA, product.id, first.id, {
      effectiveTo: '2026-04-01T00:00:00.000Z',
    });
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '120',
      effectiveFrom: '2026-04-01T00:00:00.000Z',
      effectiveTo: '2027-01-01T00:00:00.000Z',
    });

    // Extending the retired period back over the successor would leave the price
    // claimed twice from April onwards.
    await expect(
      priceService.update(ctxA, product.id, first.id, {
        effectiveTo: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const row = (await prisma.productPrice.findUnique({
      where: { id: first.id },
    })) as unknown as CreatedPrice;
    expect(row.effectiveTo?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('lets a retired period be retired again, to a later instant', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
      effectiveTo: TO,
    })) as CreatedPrice;

    await priceService.update(ctxA, product.id, created.id, {
      effectiveTo: '2026-05-01T00:00:00.000Z',
    });

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;
    expect(row.effectiveTo?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('reopens a retired period when no successor claims the time', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
      effectiveTo: TO,
    })) as CreatedPrice;

    await priceService.update(ctxA, product.id, created.id, {
      effectiveTo: null,
    });

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;
    expect(row.effectiveTo).toBeNull();
  });

  it('refuses to reopen a period a successor already claims', async () => {
    const product = await makeProduct(ctxA);
    const first = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
      effectiveTo: TO,
    })) as CreatedPrice;
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '120',
      effectiveFrom: TO,
    });

    await expect(
      priceService.update(ctxA, product.id, first.id, { effectiveTo: null }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a retirement at or before the period start', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    await expect(
      priceService.update(ctxA, product.id, created.id, {
        effectiveTo: FROM,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a create whose window ends before it starts', async () => {
    const product = await makeProduct(ctxA);

    await expect(
      priceService.create(ctxA, product.id, {
        priceType: 'retail',
        amount: '100',
        effectiveFrom: FROM,
        effectiveTo: '2025-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      await prisma.productPrice.count({ where: { productId: product.id } }),
    ).toBe(0);
  });

  it('refuses a price on a product in another organization', async () => {
    const foreign = await makeProduct(ctxB);
    await makePrice(ctxB);

    await expect(
      priceService.create(ctxA, foreign.id, {
        priceType: 'retail',
        amount: '100',
        effectiveFrom: FROM,
      }),
    ).rejects.toThrow('Product not found');

    expect(
      await prisma.productPrice.count({ where: { productId: foreign.id } }),
    ).toBe(0);
  });

  it('never returns a price through a foreign product', async () => {
    const foreignProduct = await makeProduct(ctxB);
    const foreignPrice = await makePrice(ctxB);

    await expect(
      priceService.findById(ctxA, foreignProduct.id, foreignPrice.id),
    ).rejects.toThrow('Product not found');
    await expect(
      priceService.findAll(ctxA, foreignProduct.id, { page: 1, limit: 20 }),
    ).rejects.toThrow('Product not found');
  });

  it('never returns a price of one product under another product path', async () => {
    const own = await makeProduct(ctxA);
    const other = await makeProduct(ctxA);
    const otherPrice = await makePrice(ctxA, { productId: other.id });

    // Both products belong to the caller, so the tenant check passes; the product
    // predicate is what keeps the two histories apart.
    await expect(
      priceService.findById(ctxA, own.id, otherPrice.id),
    ).rejects.toThrow('Price not found');

    const listed = (await priceService.findAll(ctxA, own.id, {
      page: 1,
      limit: 20,
    })) as CreatedPrice[];
    expect(listed).toHaveLength(0);
  });

  it('refuses a price that belongs to another organization entirely', async () => {
    const foreignProduct = await makeProduct(ctxB);
    const ownProduct = await makeProduct(ctxA);
    const foreignPrice = await makePrice(ctxB, {
      productId: foreignProduct.id,
    });

    await expect(
      priceService.findById(ctxB, foreignProduct.id, foreignPrice.id),
    ).resolves.toBeDefined();
    await expect(
      priceService.update(ctxA, ownProduct.id, foreignPrice.id, {
        effectiveTo: TO,
      }),
    ).rejects.toThrow('Price not found');
    await expect(
      priceService.delete(ctxA, ownProduct.id, foreignPrice.id),
    ).rejects.toThrow('Price not found');
  });

  it('deletes a price that has not started yet', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'promo',
      amount: '10',
      effectiveFrom: '2099-01-01T00:00:00.000Z',
    })) as CreatedPrice;

    await priceService.delete(ctxA, product.id, created.id);

    expect(
      await prisma.productPrice.findUnique({ where: { id: created.id } }),
    ).toBeNull();

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'product_price.delete', entityId: created.id },
    });
    expect(entry).not.toBeNull();
    expect(entry?.before).toMatchObject({ priceType: 'promo' });
  });

  it('refuses to delete a price that has already taken effect', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    })) as CreatedPrice;

    await expect(
      priceService.delete(ctxA, product.id, created.id),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      await prisma.productPrice.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
  });

  it('lets the RESTRICT constraint stand behind the product delete guard', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    });

    // The product service refuses to delete a product that still has price
    // history; this asserts the constraint that makes that refusal necessary.
    await expect(
      prisma.product.delete({ where: { id: product.id } }),
    ).rejects.toThrow();
  });

  it('resolves the price in force at an instant to exactly one period', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
      effectiveTo: TO,
    });
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '120',
      effectiveFrom: TO,
    });

    // The guarantee the module exists for: at any instant, one product's price of
    // a given type has one answer.
    for (const at of [
      FROM,
      '2026-03-01T00:00:00.000Z',
      '2026-06-30T23:59:59.999Z',
      TO,
      '2027-01-01T00:00:00.000Z',
    ]) {
      const inForce = (await priceService.findAll(ctxA, product.id, {
        priceType: 'retail',
        effectiveOn: at,
        page: 1,
        limit: 20,
      })) as CreatedPrice[];

      expect(inForce).toHaveLength(1);
      expect(inForce[0].effectiveFrom.getTime()).toBeLessThanOrEqual(
        new Date(at).getTime(),
      );
    }
  });

  it('lists the whole history newest first and pages through it', async () => {
    const product = await makeProduct(ctxA);
    for (const [from, to] of [
      ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'],
      ['2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'],
      ['2026-03-01T00:00:00.000Z', null],
    ] as const) {
      await priceService.create(ctxA, product.id, {
        priceType: 'retail',
        amount: '100',
        effectiveFrom: from,
        effectiveTo: to,
      });
    }

    const newest = (await priceService.findAll(ctxA, product.id, {
      page: 1,
      limit: 20,
    })) as CreatedPrice[];
    expect(newest).toHaveLength(3);
    expect(newest[0].effectiveFrom.toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );

    const firstPage = (await priceService.findAll(ctxA, product.id, {
      page: 1,
      limit: 2,
      sortBy: 'effectiveFrom',
      sortOrder: 'asc',
    })) as CreatedPrice[];
    const secondPage = (await priceService.findAll(ctxA, product.id, {
      page: 2,
      limit: 2,
      sortBy: 'effectiveFrom',
      sortOrder: 'asc',
    })) as CreatedPrice[];

    expect(firstPage).toHaveLength(2);
    expect(secondPage).toHaveLength(1);
    // The pages must not overlap, or a caller paging a history would see a
    // period twice and miss another.
    expect(firstPage.map((r) => r.id)).not.toEqual(
      expect.arrayContaining(secondPage.map((r) => r.id)),
    );
  });

  it('filters the listing by price type', async () => {
    const product = await makeProduct(ctxA);
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    });
    await priceService.create(ctxA, product.id, {
      priceType: 'wholesale',
      amount: '80',
      effectiveFrom: FROM,
    });

    const retail = (await priceService.findAll(ctxA, product.id, {
      priceType: 'retail',
      page: 1,
      limit: 20,
    })) as CreatedPrice[];

    expect(retail).toHaveLength(1);
    expect(retail[0].priceType).toBe('retail');
  });

  it('keeps two organizations histories separate for the same price type', async () => {
    const inA = await makeProduct(ctxA);
    const inB = await makeProduct(ctxB);
    await priceService.create(ctxA, inA.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    });
    await priceService.create(ctxB, inB.id, {
      priceType: 'retail',
      amount: '900',
      effectiveFrom: FROM,
    });

    const listed = (await priceService.findAll(ctxA, inA.id, {
      page: 1,
      limit: 20,
    })) as CreatedPrice[];

    expect(listed).toHaveLength(1);
    expect(listed[0].amount.toString()).toBe('100');
  });

  it('preserves a price history across a change, rather than rewriting it', async () => {
    const product = await makeProduct(ctxA);
    const first = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    })) as CreatedPrice;
    await priceService.update(ctxA, product.id, first.id, { effectiveTo: TO });
    await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '120',
      effectiveFrom: TO,
    });

    const history = (await priceService.findAll(ctxA, product.id, {
      page: 1,
      limit: 20,
      sortBy: 'effectiveFrom',
      sortOrder: 'asc',
    })) as CreatedPrice[];

    // A price change appends a period and closes the outgoing one. Both rows
    // remain, which is what BR-035 relies on to explain what a past sale was
    // priced at.
    expect(history.map((r) => r.amount.toString())).toEqual(['100', '120']);
    expect(history[0].effectiveTo?.toISOString()).toBe(TO);
    expect(history[1].effectiveTo).toBeNull();
  });

  it('rolls the create back when the audit write fails', async () => {
    const product = await makeProduct(ctxA);
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new PriceService(
      new PrismaPriceRepository(prismaService),
      productRepository,
      prismaService,
      failing,
    );

    await expect(
      service.create(ctxA, product.id, {
        priceType: 'retail',
        amount: '100',
        effectiveFrom: FROM,
      }),
    ).rejects.toThrow('audit storage unavailable');

    // The insert and the overlap check shared one transaction, so the failure
    // took the row with it.
    expect(
      await prisma.productPrice.count({ where: { productId: product.id } }),
    ).toBe(0);
  });

  it('rolls the retirement back when the audit write fails', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'retail',
      amount: '100',
      effectiveFrom: FROM,
    })) as CreatedPrice;
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new PriceService(
      new PrismaPriceRepository(prismaService),
      productRepository,
      prismaService,
      failing,
    );

    await expect(
      service.update(ctxA, product.id, created.id, { effectiveTo: TO }),
    ).rejects.toThrow('audit storage unavailable');

    const row = (await prisma.productPrice.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedPrice;
    // A failed retirement must leave the price open, not half-closed.
    expect(row.effectiveTo).toBeNull();
  });

  it('rolls the delete back when the audit write fails', async () => {
    const product = await makeProduct(ctxA);
    const created = (await priceService.create(ctxA, product.id, {
      priceType: 'promo',
      amount: '10',
      effectiveFrom: '2099-01-01T00:00:00.000Z',
    })) as CreatedPrice;
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new PriceService(
      new PrismaPriceRepository(prismaService),
      productRepository,
      prismaService,
      failing,
    );

    await expect(service.delete(ctxA, product.id, created.id)).rejects.toThrow(
      'audit storage unavailable',
    );

    expect(
      await prisma.productPrice.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
  });
});
