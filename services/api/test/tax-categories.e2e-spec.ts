import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
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
import { TaxCategoriesModule } from '../src/tax-categories/tax-categories.module.js';

process.env.JWT_SECRET ??= 'tax-categories-e2e-test-secret-0000000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TAX_OPEN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TAX_BOUNDED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TAX_BY_PRODUCT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TAX_OTHER_ORG = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const FROM = '2005-01-14T00:00:00.000Z';
const TO = '2010-01-14T00:00:00.000Z';

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
            permission: {
              id: `p-${index}`,
              code,
              status: 'active',
            },
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

/** Tax categories that stand in for the catalog, per organization. */
const TAX_CATEGORIES = [
  {
    id: TAX_OPEN,
    organizationId: ORG_A,
    name: 'VAT Standard Rate',
    code: 'VAT-STD',
    rate: '13',
    taxType: 'VAT',
    // Prisma hands the timestamptz columns back as Date objects, and the
    // service compares the window as timestamps, so the fake stores them the
    // same way rather than as strings.
    effectiveFrom: new Date(FROM),
    effectiveTo: null,
    status: 'active',
  },
  {
    id: TAX_BOUNDED,
    organizationId: ORG_A,
    name: 'VAT Reduced Rate',
    code: 'VAT-RED',
    rate: '5',
    taxType: 'VAT',
    effectiveFrom: new Date(FROM),
    effectiveTo: new Date(TO),
    status: 'active',
  },
  {
    id: TAX_BY_PRODUCT,
    organizationId: ORG_A,
    name: 'VAT Exempt',
    code: 'VAT-EX',
    rate: '0',
    taxType: 'VAT',
    effectiveFrom: new Date(FROM),
    effectiveTo: null,
    status: 'active',
  },
  {
    id: TAX_OTHER_ORG,
    organizationId: ORG_B,
    name: 'Foreign',
    code: 'FRN',
    rate: '7',
    taxType: 'VAT',
    effectiveFrom: new Date(FROM),
    effectiveTo: null,
    status: 'active',
  },
];

/** Tax category ids that products still point at. */
const TAX_BY_PRODUCT_REF = new Set([TAX_BY_PRODUCT]);

type Row = (typeof TAX_CATEGORIES)[number];

class FakePrismaService {
  readonly rows: Row[] = TAX_CATEGORIES.map((row) => ({ ...row }));

  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
    product: {
      count: ({ where }: { where: { taxCategoryId: string } }) =>
        Promise.resolve(TAX_BY_PRODUCT_REF.has(where.taxCategoryId) ? 2 : 0),
    },
    taxCategory: {
      findFirst: ({
        where,
      }: {
        where: { id?: string; code?: string; organizationId: string };
      }) => {
        const hit = this.rows.find(
          (row) =>
            row.organizationId === where.organizationId &&
            (where.id === undefined || row.id === where.id) &&
            (where.code === undefined || row.code === where.code),
        );
        return Promise.resolve(hit ?? null);
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `new-${this.rows.length}`,
          organizationId: String(data.organizationId),
          name: String(data.name),
          code: String(data.code),
          rate: String(data.rate),
          taxType: String(data.taxType),
          effectiveFrom: data.effectiveFrom as Date,
          effectiveTo: (data.effectiveTo ?? null) as Date | null,
          status: String(data.status),
        } as Row;
        this.rows.push(created);
        return Promise.resolve(created);
      },
      update: ({ where, data }: { where: { id: string }; data: unknown }) => {
        const index = this.rows.findIndex((row) => row.id === where.id);
        const patch = data as Record<string, unknown>;
        this.rows[index] = {
          ...this.rows[index],
          ...patch,
        } as Row;
        return Promise.resolve(this.rows[index]);
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = this.rows.findIndex((row) => row.id === where.id);
        this.rows.splice(index, 1);
        return Promise.resolve({});
      },
      count: ({ where }: { where: { organizationId: string } }) =>
        Promise.resolve(
          this.rows.filter((row) => row.organizationId === where.organizationId)
            .length,
        ),
      findMany: ({
        where,
      }: {
        where: {
          organizationId: string;
          status?: string;
          OR?: Array<Record<string, unknown>>;
        };
      }) =>
        Promise.resolve(
          this.rows.filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.status !== undefined && row.status !== where.status)
              return false;
            if (where.OR) {
              return where.OR.some((clause) => {
                const nameClause = clause.name as
                  { contains: string } | undefined;
                if (nameClause)
                  return row.name
                    .toLowerCase()
                    .includes(nameClause.contains.toLowerCase());
                const codeClause = clause.code as
                  { contains: string } | undefined;
                if (codeClause)
                  return row.code
                    .toLowerCase()
                    .includes(codeClause.contains.toLowerCase());
                return false;
              });
            }
            return true;
          }),
        ),
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
  imports: [AppConfigModule, LoggingModule, TaxCategoriesModule],
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
class TaxCategoriesProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [TaxCategoriesProbeModule],
  })
    // TaxCategoriesModule resolves its own PrismaService and AuditService, so a
    // provider declared on this module would not reach it. Overriding here is
    // what stops the suite from silently writing to the live development
    // database through the real repository.
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

describe('tax categories (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let audit: FakeAuditService;

  beforeAll(async () => {
    app = await buildApp();
    jwt = app.get(JwtService);
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function tokenFor(subject: string): Promise<string> {
    const subject0 = USERS[subject];
    return jwt.generateAccessToken({
      sub: subject,
      orgId: subject0.organizationId,
    });
  }

  function auth(subject: string) {
    return tokenFor(subject).then((token) => ({
      Authorization: `Bearer ${token}`,
    }));
  }

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the caller organization tax categories', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .set(await auth('manager'))
      .expect(200);

    const codes = response.body.data.data.map(
      (row: { code: string }) => row.code,
    );
    expect(codes).toEqual(['VAT-STD', 'VAT-RED', 'VAT-EX']);
    expect(codes).not.toContain('FRN');
  });

  it('wraps a successful response in the canonical envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .set(await auth('manager'))
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('creates a tax category and audits it', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'VAT Reduced Rate 5%',
        code: 'VAT-RED5',
        rate: '5',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: 'VAT Reduced Rate 5%',
      code: 'VAT-RED5',
      taxType: 'VAT',
      status: 'active',
      organizationId: ORG_A,
      effectiveTo: null,
    });
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'tax_category.create',
      entity: 'TaxCategory',
      organizationId: ORG_A,
    });
  });

  it('creates a tax category without an end to the effective window', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Service Charge',
        code: 'SVC',
        rate: '0',
        taxType: 'Service',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    // A null end is the open-ended case, so it is stored rather than defaulted
    // to some future date nobody chose.
    expect(response.body.data.effectiveTo).toBeNull();
  });

  it('accepts a rate above 100, because no business cap was decided', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Composite Levy',
        code: 'LEVY',
        rate: '250.5',
        taxType: 'Levy',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    expect(response.body.data.rate).toBe('250.5');
  });

  it('accepts a rate sent as a JSON number', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Numeric Rate',
        code: 'NUM',
        rate: 13,
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    expect(response.body.data.rate).toBe('13');
  });

  it('rejects a negative rate', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Negative',
        code: 'NEG',
        rate: '-1',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.field_errors.rate).toBeDefined();
  });

  it('rejects a rate with more than four decimal places', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Too Fine',
        code: 'FIN',
        rate: '13.12345',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(400);

    expect(response.body.error.field_errors.rate).toBeDefined();
  });

  it('rejects a rate in exponent notation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Exponent',
        code: 'EXP',
        rate: '1e-7',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(400);

    expect(response.body.error.field_errors.rate).toBeDefined();
  });

  it('rejects a create with a missing effective start', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({ name: 'No Start', code: 'NOS', rate: '13', taxType: 'VAT' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.field_errors.effectiveFrom).toBeDefined();
  });

  it('rejects a window whose end is not later than its start', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Inverted',
        code: 'INV',
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
        effectiveTo: '2005-01-14',
      })
      .expect(400);

    expect(response.body.error.message).toMatch(/effectiveTo/i);
  });

  it('accepts a future effective start, because a rate may be configured before it applies', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Future Rate',
        code: 'FUT',
        rate: '15',
        taxType: 'VAT',
        effectiveFrom: '2099-01-01',
      })
      .expect(201);
  });

  it('stores the code exactly as supplied, without case normalization', async () => {
    // No brain document defines a casing rule, so none is invented.
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Lower Case',
        code: 'vat-low',
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    expect(response.body.data.code).toBe('vat-low');
  });

  it('does not let a caller create a tax category inside another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Injected',
        code: 'INJ',
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
        organizationId: ORG_B,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');

    const list = await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .set(await auth('manager'))
      .expect(200);
    const codes = list.body.data.data.map((row: { code: string }) => row.code);
    expect(codes).not.toContain('INJ');
  });

  it('rejects a duplicate code in the same organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Duplicate',
        code: 'VAT-STD',
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('allows the same code in a different organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('intruder'))
      .send({
        name: 'VAT Standard Rate',
        code: 'VAT-STD',
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    expect(response.body.data.organizationId).toBe(ORG_B);
  });

  it('searches by name and by code', async () => {
    const byCode = await request(app.getHttpServer())
      .get('/api/v1/tax-categories?search=vat-ex')
      .set(await auth('manager'))
      .expect(200);
    expect(byCode.body.data.data.map((r: { code: string }) => r.code)).toEqual([
      'VAT-EX',
    ]);

    const byName = await request(app.getHttpServer())
      .get('/api/v1/tax-categories?search=exempt')
      .set(await auth('manager'))
      .expect(200);
    expect(byName.body.data.data.map((r: { code: string }) => r.code)).toEqual([
      'VAT-EX',
    ]);
  });

  it('serves a tax category belonging to the caller organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/tax-categories/${TAX_OPEN}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: TAX_OPEN,
      code: 'VAT-STD',
      rate: '13',
    });
  });

  it('hides a tax category belonging to another organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/tax-categories/${TAX_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).not.toContain(TAX_OTHER_ORG);
  });

  it('updates the rate in place rather than creating a new row', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .set(await auth('manager'))
      .expect(200);
    const before = list.body.data.data.length;

    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_BOUNDED}`)
      .set(await auth('manager'))
      .send({ rate: '7.5' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: TAX_BOUNDED,
      rate: '7.5',
    });
    // An omitted window must survive a rate-only patch.
    expect(response.body.data.effectiveFrom).toBe(FROM);
    expect(response.body.data.effectiveTo).toBe(TO);

    const after = await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .set(await auth('manager'))
      .expect(200);
    expect(after.body.data.data.length).toBe(before);
  });

  it('audits the rate change with the value it replaced', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_BOUNDED}`)
      .set(await auth('manager'))
      .send({ rate: '8' })
      .expect(200);

    // A rate change is an in-place edit, so the previous rate has to survive in
    // the audit history or the old value is lost for good.
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'tax_category.update',
      entity: 'TaxCategory',
      entityId: TAX_BOUNDED,
      before: expect.objectContaining({ rate: '7.5' }),
      after: expect.objectContaining({ rate: '8' }),
    });
  });

  it('renames a tax category without rewriting its code', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_BOUNDED}`)
      .set(await auth('manager'))
      .send({ name: 'VAT Reduced Rate 8%' })
      .expect(200);

    expect(response.body.data.name).toBe('VAT Reduced Rate 8%');
    expect(response.body.data.code).toBe('VAT-RED');
  });

  it('changes the organization-scoped code', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Temporary',
        code: 'TMP',
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${created.body.data.id}`)
      .set(await auth('manager'))
      .send({ code: 'TMP-RENAMED' })
      .expect(200);

    expect(response.body.data.code).toBe('TMP-RENAMED');
  });

  it('accepts a code change back to the row own code without a conflict', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_OPEN}`)
      .set(await auth('manager'))
      .send({ code: 'VAT-STD' })
      .expect(200);

    expect(response.body.data.code).toBe('VAT-STD');
  });

  it('refuses a code change that collides with another tax category', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_BOUNDED}`)
      .set(await auth('manager'))
      .send({ code: 'VAT-EX' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('refuses to update a tax category in another organization', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_OTHER_ORG}`)
      .set(await auth('manager'))
      .send({ rate: '99' })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses a start that would move past the stored end of the window', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_BOUNDED}`)
      .set(await auth('manager'))
      .send({ effectiveFrom: '2011-01-01' })
      .expect(400);

    expect(response.body.error.message).toMatch(/effectiveTo/i);
  });

  it('clears the end of the window when null is sent explicitly', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_BOUNDED}`)
      .set(await auth('manager'))
      .send({ effectiveTo: null })
      .expect(200);

    expect(response.body.data.effectiveTo).toBeNull();
  });

  it('deactivates a tax category without changing its rate', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/tax-categories/${TAX_OPEN}/deactivate`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.status).toBe('inactive');
    // Deactivation retires the category from new use; the rate a historical
    // sale was computed with has to stay readable.
    expect(response.body.data.rate).toBe('13');
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'tax_category.deactivate',
    });
  });

  it('filters the list by status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-categories?status=inactive')
      .set(await auth('manager'))
      .expect(200);

    const codes = response.body.data.data.map((r: { code: string }) => r.code);
    expect(codes).toContain('VAT-STD');
    expect(codes).not.toContain('VAT-RED');
  });

  it('refuses to delete a tax category that products still reference', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/tax-categories/${TAX_BY_PRODUCT}`)
      .set(await auth('manager'))
      .expect(400);

    expect(response.body.error.message).toMatch(/products/i);
  });

  it('deletes an unreferenced tax category', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/tax-categories')
      .set(await auth('manager'))
      .send({
        name: 'Ephemeral',
        code: 'EPH',
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: '2005-01-14',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/tax-categories/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/tax-categories/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(404);

    expect(audit.entries.at(-1)).toMatchObject({
      action: 'tax_category.delete',
      entityId: created.body.data.id,
    });
  });

  it('refuses to delete a tax category in another organization', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/tax-categories/${TAX_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');

    const stillThere = await request(app.getHttpServer())
      .get(`/api/v1/tax-categories/${TAX_OTHER_ORG}`)
      .set(await auth('intruder'))
      .expect(200);
    expect(stillThere.body.data.code).toBe('FRN');
  });

  it('rejects an unknown sort column without failing the request', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-categories?sortBy=organizationId')
      .set(await auth('manager'))
      .expect(200);

    expect(Array.isArray(response.body.data.data)).toBe(true);
  });

  it('keeps an intruder inside its own organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-categories')
      .set(await auth('intruder'))
      .expect(200);

    const codes = response.body.data.data.map((r: { code: string }) => r.code);
    expect(codes).toEqual(['FRN', 'VAT-STD']);
  });
});
