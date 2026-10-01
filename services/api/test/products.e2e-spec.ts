import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import * as PrismaRuntime from '@prisma/client/runtime/client';
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
import { ProductsModule } from '../src/products/products.module.js';

process.env.JWT_SECRET ??= 'products-e2e-test-secret-value-0000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CATEGORY_A = 'c1111111-1111-4111-8111-111111111111';
const CATEGORY_B = 'c2222222-2222-4222-8222-222222222222';
const BRAND_A = 'd1111111-1111-4111-8111-111111111111';
const BRAND_B = 'd2222222-2222-4222-8222-222222222222';
const UNIT_A = 'e1111111-1111-4111-8111-111111111111';
const UNIT_B = 'e2222222-2222-4222-8222-222222222222';
const TAX_A = 'f1111111-1111-4111-8111-111111111111';
const TAX_B = 'f2222222-2222-4222-8222-222222222222';
const PRODUCT_SOLD = 'a1000001-0001-4000-8000-000000000001';
const PRODUCT_BALANCED = 'a1000001-0001-4000-8000-000000000002';
const PRODUCT_BATCHED = 'a1000001-0001-4000-8000-000000000003';
const PRODUCT_ORDERED = 'a1000001-0001-4000-8000-000000000004';
const PRODUCT_PRICED = 'a1000001-0001-4000-8000-000000000005';
const PRODUCT_FREE = 'a1000001-0001-4000-8000-000000000006';
const PRODUCT_OTHER_ORG = 'b1000001-0001-4000-8000-000000000001';

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

type Row = Record<string, unknown> & {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  status: string;
};

function row(
  id: string,
  organizationId: string,
  sku: string,
  name: string,
  extra: Record<string, unknown> = {},
): Row {
  return {
    id,
    organizationId,
    sku,
    name,
    status: 'active',
    description: null,
    defaultPurchasePrice: null,
    defaultSellingPrice: null,
    reorderLevel: null,
    reorderQuantity: null,
    categoryId: null,
    brandId: null,
    unitId: null,
    taxCategoryId: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...extra,
  };
}

const PARENTS: Record<string, Row[]> = {
  category: [
    row(CATEGORY_A, ORG_A, 'CAT-1', 'Beverages'),
    row(CATEGORY_B, ORG_B, 'CAT-2', 'Foreign Category'),
  ],
  brand: [
    row(BRAND_A, ORG_A, 'BR-1', 'Everest Foods'),
    row(BRAND_B, ORG_B, 'BR-2', 'Foreign Brand'),
  ],
  unit: [
    row(UNIT_A, ORG_A, 'PCS', 'Pieces', { precision: 0 }),
    row(UNIT_B, ORG_B, 'KG', 'Kilograms', { precision: 3 }),
  ],
  taxCategory: [
    row(TAX_A, ORG_A, 'VAT-STD', 'VAT Standard Rate'),
    row(TAX_B, ORG_B, 'VAT-EX', 'VAT Exempt'),
  ],
};

const PRODUCTS: Row[] = [
  row(PRODUCT_SOLD, ORG_A, 'COK-500', 'Coca-Cola 500ml', {
    defaultSellingPrice: '60.00',
    categoryId: CATEGORY_A,
    brandId: BRAND_A,
    unitId: UNIT_A,
    taxCategoryId: TAX_A,
  }),
  row(PRODUCT_BALANCED, ORG_A, 'PAR-1K', 'Parle-G 1L', {
    reorderLevel: '10.000',
    reorderQuantity: '24.000',
  }),
  row(PRODUCT_BATCHED, ORG_A, 'MUG-1', 'Tea Mug 1kg'),
  row(PRODUCT_ORDERED, ORG_A, 'RICE-5', 'Rice 5kg'),
  row(PRODUCT_PRICED, ORG_A, 'MILK-1', 'Milk 1L'),
  row(PRODUCT_FREE, ORG_A, 'BIS-1', 'Biscuits'),
  row(PRODUCT_OTHER_ORG, ORG_B, 'COK-500', 'Foreign Coke'),
];

/** Child-table row counts that make a product undeletable. */
const HISTORY: Record<string, Record<string, number>> = {
  [PRODUCT_SOLD]: { saleItem: 4 },
  [PRODUCT_BALANCED]: { inventoryBalance: 2 },
  [PRODUCT_BATCHED]: { productBatch: 1 },
  [PRODUCT_ORDERED]: { purchaseOrderItem: 3 },
  [PRODUCT_PRICED]: { productPrice: 2 },
};

const HISTORY_TABLES = [
  'saleItem',
  'saleReturnItem',
  'productBatch',
  'inventoryBalance',
  'inventoryMovement',
  'stockAdjustmentItem',
  'stockTransferItem',
  'purchaseOrderItem',
  'goodsReceiptItem',
  'productPrice',
];

/**
 * Only text and numeric columns are ever read back out of a fake row, so this
 * narrows before stringifying instead of letting an arbitrary value reach
 * Object's default "[object Object]".
 */
function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  return JSON.stringify(value);
}

function compareField(
  candidate: Row,
  field: string,
  expected: unknown,
): boolean {
  const actual = candidate[field];
  if (expected !== null && typeof expected === 'object') {
    const filter = expected as { contains: string; mode?: string };
    return asText(actual).toLowerCase().includes(filter.contains.toLowerCase());
  }
  return actual === expected;
}

/**
 * Mirrors the where clause the repository builds. Every field has to hold, and
 * an `OR` alternation is combined with the rest of the clause rather than
 * replacing it, so a search is still bounded by the caller's organization.
 */
function matches(candidate: Row, where: Record<string, unknown>): boolean {
  const alternatives = (where.OR as Array<Record<string, unknown>>) ?? null;
  const base = { ...where };
  delete base.OR;

  const baseHolds = Object.entries(base).every(([field, expected]) =>
    compareField(candidate, field, expected),
  );
  if (!baseHolds) {
    return false;
  }
  if (alternatives === null) {
    return true;
  }
  return alternatives.some((clause) =>
    Object.entries(clause).every(([field, expected]) =>
      compareField(candidate, field, expected),
    ),
  );
}

/**
 * A product joined the way the repository asks for it: the four parents are
 * attached, and the money and quantity columns are Decimal instances so the
 * wire type assertion about exact decimal strings is meaningful.
 */
function join(row0: Row) {
  const lookup = (table: string, key: string) => {
    const id = row0[key] as string | null;
    if (id === null) {
      return null;
    }
    const parent = PARENTS[table].find((r) => r.id === id);
    if (parent === undefined) {
      return null;
    }
    if (table === 'unit') {
      return { id: parent.id, code: parent.sku, precision: parent.precision };
    }
    if (table === 'taxCategory') {
      return { id: parent.id, code: parent.sku, name: parent.name };
    }
    return { id: parent.id, name: parent.name };
  };
  return {
    ...row0,
    category: lookup('category', 'categoryId'),
    brand: lookup('brand', 'brandId'),
    unit: lookup('unit', 'unitId'),
    taxCategory: lookup('taxCategory', 'taxCategoryId'),
  };
}

/**
 * Wraps a stored decimal in the same Prisma Decimal the real client returns, so
 * the wire assertions here see exactly what a client sees. Decimal serializes
 * through toString(), which keeps the value exact but normalizes trailing
 * zeros away: 45.50 goes out as "45.5" and 10.000 as "10".
 */
function decimalize(row0: Row) {
  const { Decimal } = PrismaRuntime;
  const result: Record<string, unknown> = { ...row0 };
  for (const column of [
    'defaultPurchasePrice',
    'defaultSellingPrice',
    'reorderLevel',
    'reorderQuantity',
  ]) {
    const current = result[column];
    if (current !== null && current !== undefined) {
      result[column] = new Decimal(asText(current));
    }
  }
  return result;
}

class FakePrismaService {
  readonly rows: Row[] = PRODUCTS.map((r) => ({ ...r }));

  private parent(table: string) {
    return {
      findFirst: ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const hit = PARENTS[table].find(
          (r) => r.id === where.id && r.organizationId === where.organizationId,
        );
        return Promise.resolve(hit ?? null);
      },
    };
  }

  /**
   * The delete guard counts the ten child tables on whichever client the
   * service resolved, which is `prisma.client` for a plain HTTP request and the
   * transaction client otherwise. The delegates therefore live on `client` and
   * the transaction simply reuses it.
   */
  private historyCount = HISTORY_TABLES.reduce<
    Record<
      string,
      { count: (args: { where: { productId: string } }) => Promise<number> }
    >
  >((acc, table) => {
    acc[table] = {
      count: ({ where }: { where: { productId: string } }) =>
        Promise.resolve(HISTORY[where.productId]?.[table] ?? 0),
    };
    return acc;
  }, {});

  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
    category: this.parent('category'),
    brand: this.parent('brand'),
    unit: this.parent('unit'),
    taxCategory: this.parent('taxCategory'),
    product: {
      findFirst: ({
        where,
      }: {
        where: { id?: string; sku?: string; organizationId: string };
      }) => {
        const hit = this.rows.find((r) => matches(r, where));
        // Prisma hands back Decimal instances for Decimal columns on every read,
        // not only on a list, so the fake converts on each of them.
        return Promise.resolve(hit === undefined ? null : decimalize(hit));
      },
      findMany: ({
        where,
        skip,
        take,
        orderBy,
      }: {
        where: Record<string, unknown>;
        skip: number;
        take: number;
        orderBy: Record<string, 'asc' | 'desc'>;
      }) => {
        const found = this.rows.filter((r) => matches(r, where));
        const [column, direction] = Object.entries(orderBy)[0];
        found.sort((left, right) => {
          const a = left[column];
          const b = right[column];
          // Two rows can share a createdAt, so an equal pair has to compare as
          // equal for the sort to stay stable, exactly as Postgres would leave
          // their order unspecified.
          if (a > b!) {
            return direction === 'asc' ? 1 : -1;
          }
          if (a < b!) {
            return direction === 'asc' ? -1 : 1;
          }
          return 0;
        });
        return Promise.resolve(
          found.slice(skip, skip + take).map((r) => join(decimalize(r))),
        );
      },
      count: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(this.rows.filter((r) => matches(r, where)).length),
      create: ({ data }: { data: Record<string, unknown> }) => {
        // The unique constraint on (organizationId, sku) is a database
        // invariant, so the fake reproduces it rather than letting a duplicate
        // through.
        const duplicate = this.rows.some(
          (r) => r.organizationId === data.organizationId && r.sku === data.sku,
        );
        if (duplicate) {
          return Promise.reject(
            Object.assign(new Error('Unique constraint failed'), {
              code: 'P2002',
            }),
          );
        }
        const created = row(
          `new-${this.rows.length}`,
          String(data.organizationId),
          String(data.sku),
          String(data.name),
          data,
        );
        this.rows.push(created);
        return Promise.resolve(decimalize(created));
      },
      update: ({ where, data }: { where: { id: string }; data: unknown }) => {
        const index = this.rows.findIndex((r) => r.id === where.id);
        if (index === -1) {
          return Promise.reject(
            Object.assign(new Error('Record not found'), { code: 'P2025' }),
          );
        }
        const patch = data as Record<string, unknown>;
        if (patch.sku !== undefined) {
          const duplicate = this.rows.some(
            (r) =>
              r.id !== where.id &&
              r.organizationId === this.rows[index].organizationId &&
              r.sku === patch.sku,
          );
          if (duplicate) {
            return Promise.reject(
              Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
              }),
            );
          }
        }
        this.rows[index] = { ...this.rows[index], ...patch };
        return Promise.resolve(decimalize(this.rows[index]));
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = this.rows.findIndex((r) => r.id === where.id);
        this.rows.splice(index, 1);
        return Promise.resolve({});
      },
    },
    ...this.historyCount,
  };

  runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn(this.client);
  }
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
  imports: [AppConfigModule, LoggingModule, ProductsModule],
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
class ProductsProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [ProductsProbeModule],
  })
    // ProductsModule resolves its own PrismaService, and so do the category,
    // brand and unit modules it imports. A provider declared on this module
    // would not reach them, so the override is what stops the suite from writing
    // to the live development database through the real repositories.
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

describe('products (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let audit: FakeAuditService;
  let prisma: FakePrismaService;

  beforeAll(async () => {
    app = await buildApp();
    jwt = app.get(JwtService);
    audit = app.get(AuditService);
    prisma = app.get(PrismaService) as unknown as FakePrismaService;
  });

  afterAll(async () => {
    await app.close();
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
    await request(app.getHttpServer()).get('/api/v1/products').expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the caller organization products', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(await auth('manager'))
      .expect(200);

    const skus = response.body.data.data.map((r: Row) => r.sku);
    expect(skus).toEqual([
      'COK-500',
      'PAR-1K',
      'MUG-1',
      'RICE-5',
      'MILK-1',
      'BIS-1',
    ]);
    expect(skus).not.toContain('Foreign Coke');
  });

  it('wraps a successful response in the canonical envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(await auth('manager'))
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('joins the four parents for a catalog row', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_SOLD}`)
      .set(await auth('manager'))
      .expect(200);

    // findById is an unjoined read, so the parent display fields are asserted
    // on the list row where the repository actually selects them.
    const list = await request(app.getHttpServer())
      .get('/api/v1/products?search=COK-500')
      .set(await auth('manager'))
      .expect(200);

    expect(list.body.data.data[0]).toMatchObject({
      category: { id: CATEGORY_A, name: 'Beverages' },
      brand: { id: BRAND_A, name: 'Everest Foods' },
      unit: { id: UNIT_A, code: 'PCS', precision: 0 },
      taxCategory: { id: TAX_A, code: 'VAT-STD', name: 'VAT Standard Rate' },
    });
    expect(response.body.data).toMatchObject({ id: PRODUCT_SOLD });
  });

  it('never exposes a tax rate or an inventory quantity on a product row', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(await auth('manager'))
      .expect(200);

    const first = response.body.data.data[0];
    expect(first.taxCategory).not.toHaveProperty('rate');
    expect(first).not.toHaveProperty('stock');
    expect(first).not.toHaveProperty('quantityOnHand');
  });

  it('returns money and quantity columns as exact decimal strings', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_SOLD}`)
      .set(await auth('manager'))
      .expect(200);

    // The value is exact, but Prisma's Decimal drops trailing zeros rather
    // than echoing the column scale, so a client that needs "60.00" formats
    // for display using the unit or a known scale.
    expect(response.body.data.defaultSellingPrice).toBe('60');
    expect(typeof response.body.data.defaultSellingPrice).toBe('string');

    const batched = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_BALANCED}`)
      .set(await auth('manager'))
      .expect(200);
    expect(batched.body.data.reorderLevel).toBe('10');
    expect(batched.body.data.reorderQuantity).toBe('24');
    expect(typeof batched.body.data.reorderLevel).toBe('string');
  });

  it('searches by name and by SKU, case-insensitively', async () => {
    const byName = await request(app.getHttpServer())
      .get('/api/v1/products?search=parle')
      .set(await auth('manager'))
      .expect(200);
    expect(byName.body.data.data.map((r: Row) => r.sku)).toEqual(['PAR-1K']);

    const bySku = await request(app.getHttpServer())
      .get('/api/v1/products?search=rice-5')
      .set(await auth('manager'))
      .expect(200);
    expect(bySku.body.data.data.map((r: Row) => r.sku)).toEqual(['RICE-5']);
  });

  it('filters by status', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_FREE}/deactivate`)
      .set(await auth('manager'))
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/products?status=inactive')
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.data.map((r: Row) => r.sku)).toEqual(['BIS-1']);
  });

  it('sorts on an allow-listed column', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/products?sortBy=sku&sortOrder=asc')
      .set(await auth('manager'))
      .expect(200);

    const skus = response.body.data.data.map((r: Row) => r.sku);
    expect(skus).toEqual(
      [...skus].sort((left, right) => left.localeCompare(right)),
    );
  });

  it('ignores a sortBy outside the allow-list rather than failing', async () => {
    const baseline = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(await auth('manager'))
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/products?sortBy=organizationId&sortOrder=asc')
      .set(await auth('manager'))
      .expect(200);

    // organizationId is a real column but is not client-sortable, so the
    // request falls back to the default ordering instead of handing an
    // attacker-controlled key to Prisma.
    expect(response.body.data.data.map((r: Row) => r.sku)).toEqual(
      baseline.body.data.data.map((r: Row) => r.sku),
    );
  });

  it('creates a product and audits it', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(await auth('manager'))
      .send({
        name: 'Instant Noodles',
        sku: 'NOO-1',
        defaultPurchasePrice: '38.50',
        defaultSellingPrice: 45,
        reorderLevel: '12.500',
        categoryId: CATEGORY_A,
        brandId: BRAND_A,
        unitId: UNIT_A,
        taxCategoryId: TAX_A,
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: 'Instant Noodles',
      sku: 'NOO-1',
      status: 'active',
      organizationId: ORG_A,
    });
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product.create',
      entity: 'Product',
      organizationId: ORG_A,
    });
  });

  it('does not let a caller create a product inside another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(await auth('manager'))
      .send({ name: 'Injected', sku: 'INJ-1', organizationId: ORG_B })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(prisma.rows.some((r) => r.sku === 'INJ-1')).toBe(false);
  });

  it('accepts a price sent as a JSON number and returns it exactly', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(await auth('manager'))
      .send({ name: 'Price Probe', sku: 'PRB-1', defaultSellingPrice: 0.1 })
      .expect(201);

    // 0.1 has no exact binary form, so the stored value must come back as the
    // exact decimal text rather than as the double that was sent.
    expect(response.body.data.defaultSellingPrice).toBe('0.1');
    expect(typeof response.body.data.defaultSellingPrice).toBe('string');
  });

  it('rejects a create with no name or no sku', async () => {
    for (const body of [{}, { name: 'No SKU' }, { sku: 'NO-NAME' }]) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set(await auth('manager'))
        .send(body)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects a negative price or quantity', async () => {
    for (const body of [
      { name: 'Neg', sku: 'NEG-1', defaultSellingPrice: '-1.00' },
      { name: 'Neg', sku: 'NEG-2', defaultPurchasePrice: -5 },
      { name: 'Neg', sku: 'NEG-3', reorderLevel: '-0.001' },
      { name: 'Neg', sku: 'NEG-4', reorderQuantity: -1 },
    ]) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set(await auth('manager'))
        .send(body)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects a value beyond the stored decimal scale', async () => {
    for (const body of [
      { name: 'Scale', sku: 'SCL-1', defaultSellingPrice: '1.234' },
      { name: 'Scale', sku: 'SCL-2', reorderLevel: '1.2345' },
      { name: 'Scale', sku: 'SCL-3', defaultPurchasePrice: '1e-7' },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set(await auth('manager'))
        .send(body)
        .expect(400);
    }
  });

  it('rejects a parent that belongs to another organization', async () => {
    for (const body of [
      { name: 'Cross', sku: 'X-1', categoryId: CATEGORY_B },
      { name: 'Cross', sku: 'X-2', brandId: BRAND_B },
      { name: 'Cross', sku: 'X-3', unitId: UNIT_B },
      { name: 'Cross', sku: 'X-4', taxCategoryId: TAX_B },
    ]) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set(await auth('manager'))
        .send(body)
        .expect(400);

      // The reference is reported as an unusable input rather than as a
      // forbidden one, so that a cross-tenant id is indistinguishable from an
      // id that simply does not exist.
      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(response.body.error.message).toContain('organization');
    }
    expect(prisma.rows.some((r) => r.sku.startsWith('X-'))).toBe(false);
  });

  it('accepts a product with no parents at all', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(await auth('manager'))
      .send({ name: 'Loose Item', sku: 'LOOSE-1' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      categoryId: null,
      brandId: null,
      unitId: null,
      taxCategoryId: null,
    });
  });

  it('rejects a duplicate SKU in the same organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(await auth('manager'))
      .send({ name: 'Duplicate', sku: 'COK-500' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('allows the same SKU in a different organization', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(await auth('intruder'))
      .send({ name: 'Their Coke', sku: 'NOO-1' })
      .expect(201);
  });

  it('serves a product belonging to the caller organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_BATCHED}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: PRODUCT_BATCHED,
      sku: 'MUG-1',
    });
  });

  it('hides a product belonging to another organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('does not let one tenant update or deactivate another tenant product', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_OTHER_ORG}`)
      .set(await auth('manager'))
      .send({ name: 'Hijacked' })
      .expect(404);

    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_OTHER_ORG}/deactivate`)
      .set(await auth('manager'))
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(prisma.rows.find((r) => r.id === PRODUCT_OTHER_ORG)).toMatchObject({
      name: 'Foreign Coke',
      status: 'active',
    });
  });

  it('updates a product and audits the change', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_BATCHED}`)
      .set(await auth('manager'))
      .send({ name: 'Renamed Mug', defaultSellingPrice: '420.00' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      name: 'Renamed Mug',
      defaultSellingPrice: '420',
    });
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product.update',
      entity: 'Product',
      entityId: PRODUCT_BATCHED,
      organizationId: ORG_A,
    });
  });

  it('clears an optional parent with an explicit null', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_SOLD}`)
      .set(await auth('manager'))
      .send({ brandId: null, description: null })
      .expect(200);

    expect(response.body.data).toMatchObject({
      brandId: null,
      description: null,
    });
    // The untouched columns keep their values, so a null does not wipe the row.
    expect(response.body.data.categoryId).toBe(CATEGORY_A);
  });

  it('rejects an update that moves a parent to another organization', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_BATCHED}`)
      .set(await auth('manager'))
      .send({ categoryId: CATEGORY_B })
      .expect(400);

    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.message).toContain('organization');
  });

  it('rejects an update that would duplicate a SKU', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_BATCHED}`)
      .set(await auth('manager'))
      .send({ sku: 'PAR-1K' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('deactivates a product without deleting it', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_BATCHED}/deactivate`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.status).toBe('inactive');
    expect(prisma.rows.some((r) => r.id === PRODUCT_BATCHED)).toBe(true);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product.deactivate',
      entity: 'Product',
    });
    expect(audit.entries.length).toBe(before + 1);
  });

  it('reactivates a product through a plain update', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_BATCHED}`)
      .set(await auth('manager'))
      .send({ status: 'active' })
      .expect(200);

    expect(response.body.data.status).toBe('active');
  });

  it('rejects an unknown status', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_BATCHED}`)
      .set(await auth('manager'))
      .send({ status: 'discontinued' })
      .expect(400);
  });

  it('refuses to delete a product that has any recorded history', async () => {
    const cases: Array<[string, string]> = [
      [PRODUCT_SOLD, 'sales history'],
      [PRODUCT_BALANCED, 'inventory history'],
      [PRODUCT_BATCHED, 'inventory history'],
      [PRODUCT_ORDERED, 'purchasing records'],
      [PRODUCT_PRICED, 'price history'],
    ];

    for (const [id, fragment] of cases) {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/products/${id}`)
        .set(await auth('manager'))
        .expect(400);

      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(response.body.error.message).toContain(fragment);
      expect(response.body.error.message).toContain('deactivate');
      expect(prisma.rows.some((r) => r.id === id)).toBe(true);
    }
  });

  it('deletes an unreferenced product and audits it', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_FREE}`)
      .set(await auth('manager'))
      .expect(204);

    expect(response.body).toEqual({});
    expect(prisma.rows.some((r) => r.id === PRODUCT_FREE)).toBe(false);
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product.delete',
      entity: 'Product',
      entityId: PRODUCT_FREE,
    });
  });

  it('returns 404 when deleting a product that is not there', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/products/99999999-9999-4999-8999-999999999999')
      .set(await auth('manager'))
      .expect(404);
  });
});
