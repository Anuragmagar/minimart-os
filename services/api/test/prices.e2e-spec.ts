import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { LoggingModule } from '../src/logging/logging.module.js';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter.js';
import { ResponseFormatInterceptor } from '../src/common/interceptors/response-format.interceptor.js';
import { createValidationPipe } from '../src/common/validation/validation-pipe.js';
import { configureApp } from '../src/configure-app.js';
import { AuthGuard } from '../src/common/guards/auth.guard.js';
import { PermissionsGuard } from '../src/common/guards/permissions.guard.js';
import { TenantScopeGuard } from '../src/common/guards/tenant-scope.guard.js';
import { PERMISSION } from '../src/auth/permission-codes.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import { PricesModule } from '../src/prices/prices.module.js';

process.env.JWT_SECRET ??= 'prices-e2e-test-secret-value-00000000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_A = 'a1000003-0001-4000-8000-000000000001';
const PRODUCT_SIBLING = 'a1000003-0001-4000-8000-000000000002';
const PRODUCT_B = 'b1000003-0001-4000-8000-000000000001';
const PRICE_RETAIL = 'a3000003-0001-4000-8000-000000000001';
const PRICE_WHOLESALE = 'a3000003-0001-4000-8000-000000000002';
const PRICE_SIBLING = 'a3000003-0001-4000-8000-000000000003';
const PRICE_FOREIGN = 'b3000003-0001-4000-8000-000000000001';

function user(id: string, organizationId: string, permissionCodes: string[]) {
  return {
    id,
    organizationId,
    email: `${id}@example.com`,
    name: id,
    status: 'active',
    roles: [
      {
        role: {
          id: `role-${id}`,
          organizationId,
          code: id,
          name: id,
          status: 'active',
          permissions: permissionCodes.map((code, index) => ({
            roleId: `role-${id}`,
            permissionId: `p-${index}`,
            permission: { id: `p-${index}`, code, status: 'active' },
          })),
        },
      },
    ],
    storeAccess: [],
  };
}

const USERS: Record<string, ReturnType<typeof user>> = {
  manager: user('manager', ORG_A, [PERMISSION.productsManage]),
  cashier: user('cashier', ORG_A, ['sales:create']),
  intruder: user('intruder', ORG_B, [PERMISSION.productsManage]),
};

type ProductRow = {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  status: string;
};

type PriceRow = {
  id: string;
  productId: string;
  priceType: string;
  amount: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const PRODUCTS: ProductRow[] = [
  {
    id: PRODUCT_A,
    organizationId: ORG_A,
    sku: 'COK-500',
    name: 'Coca-Cola 500ml',
    status: 'active',
  },
  {
    id: PRODUCT_SIBLING,
    organizationId: ORG_A,
    sku: 'PAR-1L',
    name: 'Parle-G 1L',
    status: 'active',
  },
  {
    id: PRODUCT_B,
    organizationId: ORG_B,
    sku: 'COK-500',
    name: 'Foreign Coke',
    status: 'active',
  },
];

function priceRow(
  id: string,
  productId: string,
  priceType: string,
  amount: string,
  effectiveFrom: string,
  effectiveTo: string | null,
  extra: Partial<PriceRow> = {},
): PriceRow {
  return {
    id,
    productId,
    priceType,
    amount,
    effectiveFrom: new Date(effectiveFrom),
    effectiveTo: effectiveTo === null ? null : new Date(effectiveTo),
    createdAt: new Date(effectiveFrom),
    updatedAt: new Date(effectiveFrom),
    ...extra,
  };
}

const PRICES: PriceRow[] = [
  priceRow(
    PRICE_RETAIL,
    PRODUCT_A,
    'retail',
    '100',
    '2026-01-01T00:00:00.000Z',
    '2026-07-01T00:00:00.000Z',
  ),
  priceRow(
    PRICE_WHOLESALE,
    PRODUCT_A,
    'wholesale',
    '80',
    '2026-01-01T00:00:00.000Z',
    null,
  ),
  priceRow(
    PRICE_SIBLING,
    PRODUCT_SIBLING,
    'retail',
    '45',
    '2026-01-01T00:00:00.000Z',
    null,
  ),
  priceRow(
    PRICE_FOREIGN,
    PRODUCT_B,
    'retail',
    '999',
    '2026-01-01T00:00:00.000Z',
    null,
  ),
];

/**
 * The price repository reaches the tenant through the product relation, so the
 * fake has to resolve `product: { organizationId }` rather than treating it as a
 * column. Getting this wrong would let a cross-tenant price pass the fake and
 * fail only against the real database.
 */
function matches(row: PriceRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, expected]) => {
    if (field === 'AND') {
      // The window clause is evaluated separately, because its shape is nested
      // rather than a column equality. Treating it as a column here would drop
      // every row from an effectiveOn query.
      return true;
    }
    if (field === 'product') {
      const product = PRODUCTS.find((p) => p.id === row.productId);
      return (
        product?.organizationId ===
        (expected as { organizationId: string }).organizationId
      );
    }
    if (field === 'id') {
      const not = (expected as { not: string }).not;
      return not === undefined ? row.id === expected : row.id !== not;
    }
    return row[field as keyof PriceRow] === expected;
  });
}

/** The half-open interval the overlap rule and the effectiveOn filter share. */
function inForce(row: PriceRow, at: Date): boolean {
  return (
    row.effectiveFrom <= at &&
    (row.effectiveTo === null || row.effectiveTo > at)
  );
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(String(value));
}

class FakePrismaService {
  rows: PriceRow[] = PRICES.map((r) => ({ ...r }));
  private counter = 0;

  /**
   * Restores the seeded history. Price periods accumulate and the overlap rule
   * is about the whole series, so a period created by one test would otherwise
   * make the next test's create a conflict. Each test therefore starts from the
   * same history rather than from whatever ran before it.
   */
  reset(): void {
    this.rows = PRICES.map((r) => ({ ...r }));
    this.counter = 0;
  }

  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
    product: {
      findFirst: ({
        where,
      }: {
        where: { id?: string; organizationId: string };
      }) =>
        Promise.resolve(
          PRODUCTS.find(
            (r) =>
              r.id === where.id && r.organizationId === where.organizationId,
          ) ?? null,
        ),
    },
    productPrice: {
      findFirst: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(this.rows.find((r) => matches(r, where)) ?? null),
      findMany: ({
        where,
        orderBy,
        take,
        skip,
      }: {
        where: Record<string, unknown>;
        orderBy:
          | Array<Record<string, 'asc' | 'desc'>>
          | Record<string, 'asc' | 'desc'>;
        take?: number;
        skip?: number;
      }) => {
        let found = this.rows.filter((r) => matches(r, where));

        const window = where.AND as Array<Record<string, unknown>> | undefined;
        if (window) {
          for (const clause of window) {
            const clauses = (clause.OR as Array<Record<string, unknown>>) ?? [
              clause,
            ];
            found = found.filter((row) =>
              clauses.some((c) => satisfies(row, c)),
            );
          }
        }

        // Prisma applies an orderBy list left to right, so the stable tiebreak is
        // applied first and the requested sort is applied last. A single-object
        // orderBy is accepted too, because the overlap query uses that shape.
        const clauses = Array.isArray(orderBy)
          ? [...orderBy].reverse()
          : [orderBy];
        for (const clause of clauses) {
          const column = Object.keys(clause)[0];
          const direction = clause[column];
          found = [...found].sort((left, right) => {
            const a = left[column as keyof PriceRow];
            const b = right[column as keyof PriceRow];
            const cmp = a < b ? -1 : a > b ? 1 : 0;
            return direction === 'asc' ? cmp : -cmp;
          });
        }

        const start = skip ?? 0;
        return Promise.resolve(
          take === undefined
            ? found.slice(start)
            : found.slice(start, start + take),
        );
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        this.counter += 1;
        const effectiveFrom = data.effectiveFrom as Date;
        const created = priceRow(
          `new-${this.counter}`,
          String(data.productId),
          String(data.priceType),
          // Prisma normalizes a NUMERIC into a decimal and drops trailing zeros,
          // so the fake reproduces that rather than the fixed scale it was sent.
          toNumber(data.amount)
            .toFixed(2)
            .replace(/(\.\d*?)0+$/, '$1')
            .replace(/\.$/, ''),
          effectiveFrom.toISOString(),
          data.effectiveTo === null || data.effectiveTo === undefined
            ? null
            : (data.effectiveTo as Date).toISOString(),
        );
        this.rows.push(created);
        return Promise.resolve(created);
      },
      update: ({ where, data }: { where: { id: string }; data: unknown }) => {
        const index = this.rows.findIndex((r) => r.id === where.id);
        if (index === -1) {
          return Promise.reject(
            Object.assign(new Error('Record not found'), { code: 'P2025' }),
          );
        }
        this.rows[index] = { ...this.rows[index], ...(data as object) };
        return Promise.resolve(this.rows[index]);
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = this.rows.findIndex((r) => r.id === where.id);
        this.rows.splice(index, 1);
        return Promise.resolve({});
      },
    },
  };

  runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn(this.client);
  }
}

/**
 * Evaluates one clause of the `AND` window the `effectiveOn` filter builds:
 * either `effectiveFrom <= at` or one of the two ways an open end is written.
 */
function satisfies(row: PriceRow, clause: Record<string, unknown>): boolean {
  if ('effectiveFrom' in clause) {
    const lte = (clause.effectiveFrom as { lte: Date }).lte;
    return row.effectiveFrom <= lte;
  }
  if ('effectiveTo' in clause) {
    const value = clause.effectiveTo;
    if (value === null) return row.effectiveTo === null;
    return (
      row.effectiveTo !== null && row.effectiveTo > (value as { gt: Date }).gt
    );
  }
  return false;
}

/** Records what the service asked to audit, without touching the database. */
class FakeAuditService {
  readonly entries: Array<Record<string, unknown>> = [];

  record(entry: Record<string, unknown>): Promise<unknown> {
    this.entries.push(entry);
    return Promise.resolve({});
  }
}

@Module({
  // PricesModule pulls in ProductsModule for the exported ProductRepository, so
  // the product controller registers alongside the price routes. The two path
  // patterns do not overlap, and a product request reaching this app is covered
  // by the product suite.
  imports: [AppConfigModule, LoggingModule, PricesModule],
  providers: [
    JwtService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_PIPE, useValue: createValidationPipe() },
    { provide: APP_INTERCEPTOR, useClass: ResponseFormatInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: TenantScopeGuard },
  ],
})
class PricesProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [PricesProbeModule],
  })
    // PricesModule and the product modules it imports each resolve their own
    // PrismaService, so a provider declared here would not reach them. The
    // override is what stops the suite from writing to the live development
    // database through the real repositories.
    .overrideProvider(PrismaService)
    .useClass(FakePrismaService)
    .overrideProvider(AuditService)
    .useClass(FakeAuditService)
    .compile();
  const app = configureApp(
    moduleFixture.createNestApplication<NestExpressApplication>(),
  );
  await app.init();
  return app;
}

describe('product prices (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let audit: FakeAuditService;
  let prisma: FakePrismaService;

  beforeAll(async () => {
    app = await buildApp();
    jwt = app.get(JwtService);
    audit = app.get(AuditService) as unknown as FakeAuditService;
    prisma = app.get(PrismaService) as unknown as FakePrismaService;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.reset();
    audit.entries.length = 0;
  });

  function auth(subject: string) {
    return jwt
      .generateAccessToken({
        sub: subject,
        orgId: USERS[subject].organizationId,
      })
      .then((token) => ({ Authorization: `Bearer ${token}` }));
  }

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices`)
      .expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the price periods of the named product, newest first', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .expect(200);

    // Both seeded periods start on the same day, so this also pins the tiebreak:
    // the list must not depend on insertion order.
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.every((r: PriceRow) => r.productId === PRODUCT_A),
    ).toBe(true);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('orders the history by effectiveFrom descending by default', async () => {
    const future = '2036-01-01T00:00:00.000Z';
    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({ priceType: 'promo', amount: '5', effectiveFrom: future })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices?priceType=promo`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data[0].effectiveFrom).toBe(future);
  });

  it('honours an explicit ascending sort', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/products/${PRODUCT_A}/prices?sortBy=effectiveFrom&sortOrder=asc`,
      )
      .set(await auth('manager'))
      .expect(200);

    const starts = response.body.data.map((r: PriceRow) => r.effectiveFrom);
    expect(starts).toEqual(
      [...starts].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });

  it('returns the amount as a decimal string, never a JSON number', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .expect(200);

    expect(typeof response.body.data.amount).toBe('string');
    expect(response.body.data.amount).toBe('100');
  });

  it('filters the listing by price type', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices?priceType=retail`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(PRICE_RETAIL);
  });

  it('returns only the period in force at effectiveOn', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/products/${PRODUCT_A}/prices?priceType=retail&effectiveOn=2026-03-01T00:00:00.000Z`,
      )
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(PRICE_RETAIL);
  });

  it('returns the open-ended period for its price type at effectiveOn', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/products/${PRODUCT_A}/prices?priceType=wholesale&effectiveOn=2036-06-01T00:00:00.000Z`,
      )
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(PRICE_WHOLESALE);
  });

  it('returns no period once the window has ended', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/products/${PRODUCT_A}/prices?priceType=retail&effectiveOn=2027-01-01T00:00:00.000Z`,
      )
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toHaveLength(0);
  });

  it('excludes a period that ends exactly at effectiveOn', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/products/${PRODUCT_A}/prices?priceType=retail&effectiveOn=2026-07-01T00:00:00.000Z`,
      )
      .set(await auth('manager'))
      .expect(200);

    // The interval is half-open, so the successor's start instant is not the
    // outgoing period's. The same rule decides overlap, so the two answers agree.
    expect(response.body.data).toHaveLength(0);
  });

  it('does not return a sibling product price periods', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_SIBLING}/prices`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(PRICE_SIBLING);
  });

  it('refuses to read the prices of a product in another organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_B}/prices`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.message).toContain('Product not found');
  });

  it('refuses to read a price id belonging to another organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_B}/prices/${PRICE_FOREIGN}`)
      .set(await auth('manager'))
      .expect(404);

    // A price is only reachable through its own product, so a foreign product
    // reads as missing before the price is even considered.
    expect(response.body.error.message).toContain('Product not found');
  });

  it('refuses a price that belongs to a different product in the same organization', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_SIBLING}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('creates a price period under the named product', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'member',
        amount: '75',
        effectiveFrom: '2027-01-01T00:00:00.000Z',
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      productId: PRODUCT_A,
      priceType: 'member',
      amount: '75',
      effectiveTo: null,
    });
  });

  it('refuses a payload that names its own product or organization', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'member',
        amount: '110',
        effectiveFrom: '2028-01-01T00:00:00.000Z',
        productId: PRODUCT_B,
        organizationId: ORG_B,
      })
      .expect(400);

    // The parent is the path segment, so a body that tries to name one is
    // rejected outright rather than quietly ignored. A client cannot file a price
    // against a product of another tenant by sending it.
    expect(Object.keys(response.body.error.field_errors).sort()).toEqual([
      'organizationId',
      'productId',
    ]);
    expect(prisma.rows).toHaveLength(PRICES.length);
  });

  it('stores the amount at the column scale rather than as a float', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'member',
        amount: '75.55',
        effectiveFrom: '2029-01-01T00:00:00.000Z',
      })
      .expect(201);

    expect(response.body.data.amount).toBe('75.55');
  });

  it('accepts a JSON number as well as a string for the amount', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'member',
        amount: 80.5,
        effectiveFrom: '2030-01-01T00:00:00.000Z',
      })
      .expect(201);

    expect(response.body.data.amount).toBe('80.5');
  });

  it('audits a created price period', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'member',
        amount: '70',
        effectiveFrom: '2031-01-01T00:00:00.000Z',
      })
      .expect(201);

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'product_price.create',
      entity: 'ProductPrice',
      entityId: response.body.data.id,
      organizationId: ORG_A,
      userId: 'manager',
    });
  });

  it('rejects a negative amount', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '-5',
        effectiveFrom: '2031-01-01T00:00:00.000Z',
      })
      .expect(400);

    // The pattern has no sign, so the field error names the field rather than
    // the top-level message.
    expect(Object.keys(response.body.error.field_errors)).toContain('amount');
  });

  it('rejects a price above the column limit', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '1234567890123',
        effectiveFrom: '2031-01-01T00:00:00.000Z',
      })
      .expect(400);

    expect(Object.keys(response.body.error.field_errors)).toContain('amount');
  });

  it('refuses a price on a product in another organization', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_B}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '50',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      })
      .expect(404);

    expect(response.body.error.message).toContain('Product not found');
    expect(prisma.rows.filter((r) => r.productId === PRODUCT_B)).toHaveLength(
      1,
    );
  });

  it('rejects an amount with more decimal places than the column stores', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '10.555',
        effectiveFrom: '2031-01-01T00:00:00.000Z',
      })
      .expect(400);
  });

  it('accepts a zero price, because a free line is a real thing', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'promo',
        amount: '0',
        effectiveFrom: '2032-01-01T00:00:00.000Z',
      })
      .expect(201);
  });

  it('rejects a window whose end is not after its start', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '150',
        effectiveFrom: '2033-01-01T00:00:00.000Z',
        effectiveTo: '2033-01-01T00:00:00.000Z',
      })
      .expect(400);

    expect(response.body.error.message).toContain('effectiveTo');
  });

  it('rejects a window that overlaps an existing period of the same price type', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '150',
        effectiveFrom: '2026-03-01T00:00:00.000Z',
      })
      .expect(409);

    expect(response.body.error.message).toContain('overlapping');
  });

  it('rejects a second open-ended retail price', async () => {
    // The seeded retail period is bounded, so the first open-ended successor is
    // accepted; a second one would claim instants the first already holds.
    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '120',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '150',
        effectiveFrom: '2027-01-01T00:00:00.000Z',
      })
      .expect(409);
  });

  it('allows a successor that starts exactly where the outgoing period ends', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '120',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
      })
      .expect(201);

    expect(response.body.data.amount).toBe('120');
  });

  it('allows the same window in a different price type', async () => {
    // Overlap is scoped to (product, price type). A wholesale price and a retail
    // price for the same product are two independent series.
    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'member',
        amount: '95',
        effectiveFrom: '2026-03-01T00:00:00.000Z',
      })
      .expect(201);
  });

  it('retires a period and audits before and after', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({ effectiveTo: '2026-05-01T00:00:00.000Z' })
      .expect(200);

    expect(response.body.data.effectiveTo).toBe('2026-05-01T00:00:00.000Z');
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'product_price.update',
      entityId: PRICE_RETAIL,
    });
  });

  it('rejects a retirement that would overlap the successor', async () => {
    // The seeded retail period is retired first, so a successor can be created,
    // and only then is an extension of the retired period refused.
    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({ effectiveTo: '2026-04-01T00:00:00.000Z' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'retail',
        amount: '120',
        effectiveFrom: '2026-04-01T00:00:00.000Z',
        effectiveTo: '2027-01-01T00:00:00.000Z',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({ effectiveTo: '2026-06-01T00:00:00.000Z' })
      .expect(409);

    expect(response.body.error.message).toContain('overlapping');
  });

  it('rejects a retirement at or before the period start', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({ effectiveTo: '2026-01-01T00:00:00.000Z' })
      .expect(400);
  });

  it('leaves the period untouched when effectiveTo is omitted', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({})
      .expect(200);

    // An omitted field is not a request to clear the window, so a read-modify-write
    // cannot silently reopen a price.
    expect(response.body.data.effectiveTo).toBe('2026-07-01T00:00:00.000Z');
    expect(audit.entries).toHaveLength(0);
  });

  it('refuses to change the amount of a period', async () => {
    // The DTO does not accept an amount, so the request is rejected at the edge
    // rather than silently ignoring a change the caller believed it had made.
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({ amount: '999' })
      .expect(400);

    expect(JSON.stringify(response.body.error)).toContain('amount');
  });

  it('refuses to change the price type of a period', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({ priceType: 'wholesale' })
      .expect(400);

    expect(JSON.stringify(response.body.error)).toContain('priceType');
  });

  it('refuses to move the start of a period', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .send({ effectiveFrom: '2026-02-01T00:00:00.000Z' })
      .expect(400);

    expect(JSON.stringify(response.body.error)).toContain('effectiveFrom');
  });

  it('deletes a future price period and audits the removal', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/prices`)
      .set(await auth('manager'))
      .send({
        priceType: 'promo',
        amount: '10',
        effectiveFrom: '2035-01-01T00:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_A}/prices/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);

    expect(audit.entries).toHaveLength(2);
    expect(audit.entries[1]).toMatchObject({
      action: 'product_price.delete',
      entityId: created.body.data.id,
    });
    expect(prisma.rows.some((r) => r.id === created.body.data.id)).toBe(false);
  });

  it('refuses to delete a price that has already taken effect', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_A}/prices/${PRICE_RETAIL}`)
      .set(await auth('manager'))
      .expect(400);

    expect(response.body.error.message).toContain('effectiveTo');
    expect(prisma.rows.some((r) => r.id === PRICE_RETAIL)).toBe(true);
  });

  it('refuses to delete a price under a product in another organization', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_B}/prices/${PRICE_FOREIGN}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.message).toContain('Product not found');
    expect(prisma.rows.some((r) => r.id === PRICE_FOREIGN)).toBe(true);
  });

  it('keeps each organization price history separate for the same price type', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_B}/prices`)
      .set(await auth('intruder'))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(PRICE_FOREIGN);
  });

  it('paginates the history rather than returning every period', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/products/${PRODUCT_A}/prices?limit=1&page=2&sortBy=effectiveFrom&sortOrder=asc`,
      )
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
  });

  it('rejects a page size above the documented maximum', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices?limit=500`)
      .set(await auth('manager'))
      .expect(400);
  });

  it('rejects a sort field outside the allow-list', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/prices?sortBy=amount`)
      .set(await auth('manager'))
      .expect(400);
  });

  it('resolves the price in force at an instant to exactly one period', async () => {
    // The end-to-end guarantee the whole module exists for: at any instant, a
    // product's price of a given type has a single answer.
    for (const priceType of ['retail', 'wholesale', 'member', 'promo']) {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/products/${PRODUCT_A}/prices?priceType=${priceType}&effectiveOn=2026-04-01T00:00:00.000Z`,
        )
        .set(await auth('manager'))
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a period in force for the whole of its half-open window', async () => {
    const row = prisma.rows.find((r) => r.id === PRICE_RETAIL);

    expect(inForce(row!, new Date('2026-01-01T00:00:00.000Z'))).toBe(true);
    expect(inForce(row!, new Date('2026-05-01T00:00:00.000Z'))).toBe(true);
    expect(inForce(row!, new Date('2026-07-01T00:00:00.000Z'))).toBe(false);
  });
});
