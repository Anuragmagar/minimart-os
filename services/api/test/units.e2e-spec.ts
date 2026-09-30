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
import { UnitsModule } from '../src/units/units.module.js';

process.env.JWT_SECRET ??= 'units-e2e-test-secret-value-00000000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNIT_PLAIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNIT_BY_PRODUCT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UNIT_BY_CONVERSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UNIT_OTHER_ORG = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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

/** Units that stand in for the catalog, per organization. */
const UNITS = [
  {
    id: UNIT_PLAIN,
    organizationId: ORG_A,
    name: 'Piece',
    code: 'PCS',
    precision: 0,
    status: 'active',
  },
  {
    id: UNIT_BY_PRODUCT,
    organizationId: ORG_A,
    name: 'Kilogram',
    code: 'KG',
    precision: 3,
    status: 'active',
  },
  {
    id: UNIT_BY_CONVERSION,
    organizationId: ORG_A,
    name: 'Litre',
    code: 'LTR',
    precision: 2,
    status: 'active',
  },
  {
    id: UNIT_OTHER_ORG,
    organizationId: ORG_B,
    name: 'Foreign',
    code: 'FRN',
    precision: 1,
    status: 'active',
  },
];

/** Unit ids that products still point at. */
const UNITS_BY_PRODUCT = new Set([UNIT_BY_PRODUCT]);
/** Unit ids that unit conversions still point at. */
const UNITS_BY_CONVERSION = new Set([UNIT_BY_CONVERSION]);

class FakePrismaService {
  readonly rows = [...UNITS];

  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
    product: {
      count: ({ where }: { where: { unitId: string } }) =>
        Promise.resolve(UNITS_BY_PRODUCT.has(where.unitId) ? 2 : 0),
    },
    unitConversion: {
      count: ({ where }: { where: { fromUnitId: string; toUnitId: string } }) =>
        Promise.resolve(
          UNITS_BY_CONVERSION.has(where.fromUnitId) ||
            UNITS_BY_CONVERSION.has(where.toUnitId)
            ? 1
            : 0,
        ),
    },
    unit: {
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
          precision: Number(data.precision),
          status: String(data.status),
        };
        this.rows.push(created);
        return Promise.resolve(created);
      },
      update: ({ where, data }: { where: { id: string }; data: unknown }) => {
        const index = this.rows.findIndex((row) => row.id === where.id);
        this.rows[index] = {
          ...this.rows[index],
          ...(data as Record<string, unknown>),
        } as (typeof this.rows)[number];
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
  imports: [AppConfigModule, LoggingModule, UnitsModule],
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
class UnitsProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [UnitsProbeModule],
  })
    // UnitsModule resolves its own PrismaService and AuditService, so a provider
    // declared on this module would not reach it. Overriding here is what stops
    // the suite from silently writing to the live development database through
    // the real repository.
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

describe('units (e2e)', () => {
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
    await request(app.getHttpServer()).get('/api/v1/units').expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/units')
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the caller organization units', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/units')
      .set(await auth('manager'))
      .expect(200);

    const codes = response.body.data.data.map(
      (row: { code: string }) => row.code,
    );
    expect(codes).toEqual(['PCS', 'KG', 'LTR']);
    expect(codes).not.toContain('FRN');
  });

  it('wraps a successful response in the canonical envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/units')
      .set(await auth('manager'))
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('creates a unit and audits it', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Packet', code: 'PKT', precision: 0 })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: 'Packet',
      code: 'PKT',
      precision: 0,
      status: 'active',
      organizationId: ORG_A,
    });
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'unit.create',
      entity: 'Unit',
      organizationId: ORG_A,
    });
  });

  it('stores the code exactly as supplied, without case normalization', async () => {
    // No brain document defines a casing rule, so none is invented.
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Metric Ton', code: 'mt', precision: 3 })
      .expect(201);

    expect(response.body.data.code).toBe('mt');
  });

  it('does not let a caller create a unit inside another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({
        name: 'Injected',
        code: 'INJ',
        precision: 0,
        organizationId: ORG_B,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');

    const list = await request(app.getHttpServer())
      .get('/api/v1/units')
      .set(await auth('manager'))
      .expect(200);
    const codes = list.body.data.data.map((row: { code: string }) => row.code);
    expect(codes).not.toContain('INJ');
  });

  it('rejects a create with a missing code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'No Code', precision: 0 })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('accepts precision 0, the documented whole-number case', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Box', code: 'BOX', precision: 0 })
      .expect(201);
  });

  it('accepts precision 3, the NUMERIC(14,3) quantity scale', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Gram', code: 'GRM', precision: 3 })
      .expect(201);
  });

  it('rejects a precision above the quantity scale', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Too Fine', code: 'TFM', precision: 4 })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.field_errors.precision).toBeDefined();
  });

  it('rejects a negative precision', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Negative', code: 'NEG', precision: -1 })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a fractional precision', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Fractional', code: 'FRC', precision: 1.5 })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a duplicate code in the same organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Kilo', code: 'KG', precision: 3 })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('allows the same code in a different organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('intruder'))
      .send({ name: 'Kilogram', code: 'KG', precision: 3 })
      .expect(201);

    expect(response.body.data.organizationId).toBe(ORG_B);
  });

  it('searches by name and by code', async () => {
    const byCode = await request(app.getHttpServer())
      .get('/api/v1/units?search=ltr')
      .set(await auth('manager'))
      .expect(200);
    expect(byCode.body.data.data.map((r: { code: string }) => r.code)).toEqual([
      'LTR',
    ]);

    const byName = await request(app.getHttpServer())
      .get('/api/v1/units?search=kilo')
      .set(await auth('manager'))
      .expect(200);
    expect(byName.body.data.data.map((r: { code: string }) => r.code)).toEqual([
      'KG',
    ]);
  });

  it('serves a unit belonging to the caller organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/units/${UNIT_PLAIN}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: UNIT_PLAIN,
      code: 'PCS',
      precision: 0,
    });
  });

  it('hides a unit belonging to another organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/units/${UNIT_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).not.toContain(UNIT_OTHER_ORG);
  });

  it('updates a unit and audits before and after', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Pouch', code: 'PCH', precision: 0 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/units/${created.body.data.id}`)
      .set(await auth('manager'))
      .send({ name: 'Sachet', precision: 1 })
      .expect(200);

    expect(response.body.data).toMatchObject({ name: 'Sachet', precision: 1 });
    // An omitted code must not be rewritten.
    expect(response.body.data.code).toBe('PCH');
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'unit.update',
      before: expect.objectContaining({ name: 'Pouch', precision: 0 }),
      after: expect.objectContaining({ name: 'Sachet', precision: 1 }),
    });
  });

  it('refuses to update a unit in another organization', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/units/${UNIT_OTHER_ORG}`)
      .set(await auth('manager'))
      .send({ name: 'Hijacked' })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses a code change that collides with another unit', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/units/${UNIT_BY_CONVERSION}`)
      .set(await auth('manager'))
      .send({ code: 'PCS' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects an out-of-range precision on update', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/units/${UNIT_PLAIN}`)
      .set(await auth('manager'))
      .send({ precision: 9 })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('deactivates a unit', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/units/${UNIT_PLAIN}/deactivate`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.status).toBe('inactive');
    expect(audit.entries.at(-1)).toMatchObject({ action: 'unit.deactivate' });
  });

  it('filters the list by status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/units?status=inactive')
      .set(await auth('manager'))
      .expect(200);

    const codes = response.body.data.data.map((r: { code: string }) => r.code);
    expect(codes).toContain('PCS');
    expect(codes).not.toContain('KG');
  });

  it('refuses to delete a unit that products still reference', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/units/${UNIT_BY_PRODUCT}`)
      .set(await auth('manager'))
      .expect(400);

    expect(response.body.error.message).toMatch(/products/i);
  });

  it('refuses to delete a unit that conversions still reference', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/units/${UNIT_BY_CONVERSION}`)
      .set(await auth('manager'))
      .expect(400);

    expect(response.body.error.message).toMatch(/conversions/i);
  });

  it('deletes an unreferenced unit', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set(await auth('manager'))
      .send({ name: 'Temporary', code: 'TMP', precision: 0 })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/units/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/units/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('refuses to delete a unit in another organization', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/units/${UNIT_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');

    const stillThere = await request(app.getHttpServer())
      .get(`/api/v1/units/${UNIT_OTHER_ORG}`)
      .set(await auth('intruder'))
      .expect(200);
    expect(stillThere.body.data.code).toBe('FRN');
  });

  it('rejects an unknown sort column without failing the request', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/units?sortBy=organizationId')
      .set(await auth('manager'))
      .expect(200);

    expect(Array.isArray(response.body.data.data)).toBe(true);
  });

  it('keeps an intruder inside its own organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/units')
      .set(await auth('intruder'))
      .expect(200);

    const codes = response.body.data.data.map((r: { code: string }) => r.code);
    expect(codes).toEqual(['FRN', 'KG']);
  });
});
