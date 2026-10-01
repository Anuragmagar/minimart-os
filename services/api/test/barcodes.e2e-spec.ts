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
import { BarcodesModule } from '../src/barcodes/barcodes.module.js';

process.env.JWT_SECRET ??= 'barcodes-e2e-test-secret-value-000000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_A = 'a1000002-0001-4000-8000-000000000001';
const PRODUCT_SIBLING = 'a1000002-0001-4000-8000-000000000002';
const PRODUCT_B = 'b1000002-0001-4000-8000-000000000001';
const BARCODE_EAN = 'a2000002-0001-4000-8000-000000000001';
const BARCODE_IN_STORE = 'a2000002-0001-4000-8000-000000000002';
const BARCODE_SIBLING = 'a2000002-0001-4000-8000-000000000003';
const BARCODE_FOREIGN = 'b2000002-0001-4000-8000-000000000001';

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

type BarcodeRow = {
  id: string;
  organizationId: string;
  productId: string;
  barcode: string;
  barcodeType: string | null;
  isPrimary: boolean;
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

function barcodeRow(
  id: string,
  organizationId: string,
  productId: string,
  value: string,
  extra: Partial<BarcodeRow> = {},
): BarcodeRow {
  return {
    id,
    organizationId,
    productId,
    barcode: value,
    barcodeType: null,
    isPrimary: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...extra,
  };
}

const BARCODES: BarcodeRow[] = [
  barcodeRow(BARCODE_EAN, ORG_A, PRODUCT_A, '5000112637922', {
    barcodeType: 'EAN13',
    isPrimary: true,
  }),
  barcodeRow(BARCODE_IN_STORE, ORG_A, PRODUCT_A, 'COLD-DRINK-500ML', {
    createdAt: new Date('2024-02-01T00:00:00.000Z'),
  }),
  barcodeRow(BARCODE_SIBLING, ORG_A, PRODUCT_SIBLING, '8901030895489', {
    isPrimary: true,
  }),
  barcodeRow(BARCODE_FOREIGN, ORG_B, PRODUCT_B, '5000112637922', {
    isPrimary: true,
  }),
];

/**
 * Every predicate a barcode query can carry is a plain equality, so the fake
 * evaluates the clause field by field. A clause with no `productId` is what the
 * organization-wide uniqueness check looks like, and it must not be narrowed to
 * one product.
 */
function matches(row: BarcodeRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(
    ([field, expected]) => row[field as keyof BarcodeRow] === expected,
  );
}

class FakePrismaService {
  readonly rows: BarcodeRow[] = BARCODES.map((r) => ({ ...r }));

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
    productBarcode: {
      findFirst: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(this.rows.find((r) => matches(r, where)) ?? null),
      findMany: ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy: Record<string, 'asc' | 'desc'>;
      }) => {
        const found = this.rows.filter((r) => matches(r, where));
        const [column, direction] = Object.entries(orderBy)[0];
        found.sort((left, right) => {
          const a = left[column as keyof BarcodeRow];
          const b = right[column as keyof BarcodeRow];
          const cmp = a < b ? -1 : a > b ? 1 : 0;
          return direction === 'asc' ? cmp : -cmp;
        });
        return Promise.resolve(found);
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        // The unique constraint on (organizationId, barcode) is a database
        // invariant, so the fake reproduces it rather than letting a second
        // product claim a code the organization already prints.
        const duplicate = this.rows.some(
          (r) =>
            r.organizationId === data.organizationId &&
            r.barcode === data.barcode,
        );
        if (duplicate) {
          return Promise.reject(
            Object.assign(new Error('Unique constraint failed'), {
              code: 'P2002',
            }),
          );
        }
        const created = barcodeRow(
          `new-${this.rows.length}`,
          String(data.organizationId),
          String(data.productId),
          String(data.barcode),
          {
            barcodeType: (data.barcodeType as string | null) ?? null,
            isPrimary: data.isPrimary === true,
          },
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
      updateMany: ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const row of this.rows) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return Promise.resolve({ count });
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

/** Records what the service asked to audit, without touching the database. */
class FakeAuditService {
  readonly entries: Array<Record<string, unknown>> = [];

  record(entry: Record<string, unknown>): Promise<unknown> {
    this.entries.push(entry);
    return Promise.resolve({});
  }
}

@Module({
  // BarcodesModule pulls in ProductsModule for the exported ProductRepository, so
  // the product controller registers alongside the barcode routes. The two path
  // patterns do not overlap, and a product request reaching this app is covered
  // by the product suite.
  imports: [AppConfigModule, LoggingModule, BarcodesModule],
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
class BarcodesProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [BarcodesProbeModule],
  })
    // BarcodesModule and the product modules it imports each resolve their own
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

describe('product barcodes (e2e)', () => {
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
    await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the barcodes of the named product, oldest first', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.map((r: BarcodeRow) => r.barcode)).toEqual([
      '5000112637922',
      'COLD-DRINK-500ML',
    ]);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('does not return a sibling product barcodes', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_SIBLING}/barcodes`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.map((r: BarcodeRow) => r.barcode)).toEqual([
      '8901030895489',
    ]);
  });

  it('refuses to read the barcodes of a product in another organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_B}/barcodes`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.message).toContain('Product not found');
  });

  it('gets one barcode of the product', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_EAN}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: BARCODE_EAN,
      organizationId: ORG_A,
      productId: PRODUCT_A,
      barcode: '5000112637922',
      barcodeType: 'EAN13',
      isPrimary: true,
    });
  });

  it('refuses a barcode that belongs to another product', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_SIBLING}/barcodes/${BARCODE_EAN}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('creates a barcode under the named product', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .send({ barcode: 'COLD-DRINK-330ML', barcodeType: 'IN_STORE' })
      .expect(201);

    // The organization comes from the token, so a caller cannot file a barcode
    // against a product of another tenant by naming one.
    expect(response.body.data).toMatchObject({
      organizationId: ORG_A,
      productId: PRODUCT_A,
      barcode: 'COLD-DRINK-330ML',
      barcodeType: 'IN_STORE',
      isPrimary: false,
    });
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product_barcode.create',
      entity: 'ProductBarcode',
      organizationId: ORG_A,
    });
  });

  it('defaults an omitted type to null', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .send({ barcode: '9780201379624' })
      .expect(201);

    expect(response.body.data.barcodeType).toBeNull();
    expect(response.body.data.isPrimary).toBe(false);
  });

  it('promotes a new primary and demotes the previous one', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .send({ barcode: '9780201379625', isPrimary: true })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .expect(200);

    const primaries = list.body.data.filter((r: BarcodeRow) => r.isPrimary);
    // Exactly one primary survives, and it is the barcode just created.
    expect(primaries).toHaveLength(1);
    expect(primaries[0].barcode).toBe('9780201379625');
  });

  it('rejects a value the organization already uses', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_SIBLING}/barcodes`)
      .set(await auth('manager'))
      .send({ barcode: '5000112637922' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('lets another organization use a value another organization already has', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_B}/barcodes`)
      .set(await auth('intruder'))
      .send({ barcode: 'COLD-DRINK-500ML' })
      .expect(201);

    // The value already exists in ORG_A on a different product, and it is
    // accepted here: uniqueness is scoped to the organization, which is why
    // product_barcodes carries organization_id on the row instead of inferring
    // it through the product.
    expect(response.body.data.organizationId).toBe(ORG_B);
    expect(
      prisma.rows.filter((r) => r.barcode === 'COLD-DRINK-500ML'),
    ).toHaveLength(2);
  });

  it('refuses to create under a product outside the organization', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_B}/barcodes`)
      .set(await auth('manager'))
      .send({ barcode: 'ANY-CODE-1' })
      .expect(404);

    expect(response.body.error.message).toContain('Product not found');
    expect(prisma.rows.some((r) => r.barcode === 'ANY-CODE-1')).toBe(false);
  });

  it('rejects an empty or over-long value', async () => {
    for (const body of [{ barcode: '' }, { barcode: 'X'.repeat(65) }]) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/products/${PRODUCT_A}/barcodes`)
        .set(await auth('manager'))
        .send(body)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects a non-boolean primary flag', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .send({ barcode: 'COLD-DRINK-1L', isPrimary: 'yes' })
      .expect(400);
  });

  it('updates the type of a barcode', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_IN_STORE}`)
      .set(await auth('manager'))
      .send({ barcodeType: 'IN_STORE' })
      .expect(200);

    expect(response.body.data.barcodeType).toBe('IN_STORE');
    // Omitted fields are left alone rather than reset.
    expect(response.body.data.isPrimary).toBe(false);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product_barcode.update',
      before: expect.objectContaining({ barcodeType: null }),
      after: expect.objectContaining({ barcodeType: 'IN_STORE' }),
    });
  });

  it('clears the type when an explicit null is sent', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_IN_STORE}`)
      .set(await auth('manager'))
      .send({ barcodeType: null })
      .expect(200);

    expect(response.body.data.barcodeType).toBeNull();
  });

  it('promotes through an update and demotes the previous primary', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_IN_STORE}`)
      .set(await auth('manager'))
      .send({ isPrimary: true })
      .expect(200);

    expect(response.body.data.isPrimary).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .expect(200);
    expect(list.body.data.filter((r: BarcodeRow) => r.isPrimary)).toHaveLength(
      1,
    );
  });

  it('rejects an attempt to change the immutable value', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_IN_STORE}`)
      .set(await auth('manager'))
      .send({ barcode: 'REPLACED-CODE' })
      .expect(400);

    // The field is not on the update DTO at all, so the global pipe refuses it
    // rather than dropping it silently.
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(prisma.rows.some((r) => r.barcode === 'REPLACED-CODE')).toBe(false);
  });

  it('returns the row unchanged for an update with no fields', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_IN_STORE}`)
      .set(await auth('manager'))
      .send({})
      .expect(200);

    expect(response.body.data.id).toBe(BARCODE_IN_STORE);
  });

  it('refuses to update a barcode of another organization', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_FOREIGN}`)
      .set(await auth('manager'))
      .send({ isPrimary: true })
      .expect(404);
  });

  it('deletes a barcode and audits the removal', async () => {
    const before = prisma.rows.length;

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_IN_STORE}`)
      .set(await auth('manager'))
      .expect(204);

    expect(prisma.rows).toHaveLength(before - 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product_barcode.delete',
      entity: 'ProductBarcode',
      before: expect.objectContaining({ barcode: 'COLD-DRINK-500ML' }),
    });
  });

  it('leaves the product with no primary when the primary is deleted', async () => {
    // Promote a known barcode first so the delete acts on the primary itself.
    await request(app.getHttpServer())
      .put(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_EAN}`)
      .set(await auth('manager'))
      .send({ isPrimary: true })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_EAN}`)
      .set(await auth('manager'))
      .expect(204);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/products/${PRODUCT_A}/barcodes`)
      .set(await auth('manager'))
      .expect(200);

    // Nothing documents which remaining code should succeed the deleted one, so
    // no successor is invented.
    expect(list.body.data.every((r: BarcodeRow) => !r.isPrimary)).toBe(true);
  });

  it('refuses to delete a barcode that is not in the organization', async () => {
    const before = prisma.rows.length;

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${PRODUCT_A}/barcodes/${BARCODE_FOREIGN}`)
      .set(await auth('manager'))
      .expect(404);

    expect(prisma.rows).toHaveLength(before);
  });

  it('reports an unknown product id as a missing product', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/products/aaaaaaaa-4aaa-8aaa-aaaaaaaa9999/barcodes')
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.message).toContain('Product not found');
  });
});
