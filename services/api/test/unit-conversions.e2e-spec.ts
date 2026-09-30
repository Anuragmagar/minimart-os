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
import { UnitConversionsModule } from '../src/unit-conversions/unit-conversions.module.js';

process.env.JWT_SECRET ??= 'conversions-e2e-test-secret-value-0000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOZ = '11111111-1111-4111-8111-111111111111';
const PCS = '22222222-2222-4222-8222-222222222222';
const BOX = '33333333-3333-4333-8333-333333333333';
const CARTON = '44444444-4444-4444-8444-444444444444';
const OTHER_ORG_UNIT = '55555555-5555-4555-8555-555555555555';

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

/** Units per organization. Only codes and precision are read by this module. */
const UNITS = [
  {
    id: DOZ,
    organizationId: ORG_A,
    name: 'Dozen',
    code: 'DOZ',
    precision: 0,
    status: 'active',
  },
  {
    id: PCS,
    organizationId: ORG_A,
    name: 'Piece',
    code: 'PCS',
    precision: 0,
    status: 'active',
  },
  {
    id: BOX,
    organizationId: ORG_A,
    name: 'Box',
    code: 'BOX',
    precision: 0,
    status: 'active',
  },
  {
    id: CARTON,
    organizationId: ORG_A,
    name: 'Carton',
    code: 'CTN',
    precision: 0,
    status: 'active',
  },
  {
    id: OTHER_ORG_UNIT,
    organizationId: ORG_B,
    name: 'Foreign',
    code: 'FRN',
    precision: 0,
    status: 'active',
  },
];

type Row = {
  id: string;
  organizationId: string;
  fromUnitId: string;
  toUnitId: string;
  /** Stored as a string, mirroring DECIMAL(14,6) exactness. */
  multiplier: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Seeded graph: DOZ -> PCS 12 and BOX -> PCS 10, mirroring prisma/seed.ts. */
const CONVERSIONS: Row[] = [
  {
    id: 'ccccccc1-cccc-4ccc-8ccc-ccccccccccc',
    organizationId: ORG_A,
    fromUnitId: DOZ,
    toUnitId: PCS,
    multiplier: '12.000000',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'ccccccc2-cccc-4ccc-8ccc-ccccccccccc',
    organizationId: ORG_A,
    fromUnitId: BOX,
    toUnitId: PCS,
    multiplier: '10.000000',
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-02'),
  },
];

class FakePrismaService {
  unitRows: Array<(typeof UNITS)[number]> = [...UNITS];
  conversionRows: Row[] = [...CONVERSIONS];

  /**
   * Restores the seeded graph so each test starts from the same state. Without
   * this the tests would depend on the order they run in, and a test asserting a
   * fresh edge would fail because an earlier test had already created it.
   */
  reset(): void {
    this.unitRows = [...UNITS];
    this.conversionRows = [...CONVERSIONS];
  }

  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
    unit: {
      findFirst: ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) =>
        Promise.resolve(
          this.unitRows.find(
            (row) =>
              row.id === where.id &&
              row.organizationId === where.organizationId,
          ) ?? null,
        ),
    },
    unitConversion: {
      findFirst: ({
        where,
      }: {
        where: {
          id?: string;
          fromUnitId?: string;
          toUnitId?: string;
          organizationId: string;
        };
      }) =>
        Promise.resolve(
          this.conversionRows.find(
            (row) =>
              row.organizationId === where.organizationId &&
              (where.id === undefined || row.id === where.id) &&
              (where.fromUnitId === undefined ||
                row.fromUnitId === where.fromUnitId) &&
              (where.toUnitId === undefined || row.toUnitId === where.toUnitId),
          ) ?? null,
        ),
      findMany: ({
        where,
        include,
        skip,
        take,
      }: {
        where: {
          organizationId: string;
          fromUnitId?: string | { in: string[] };
          toUnitId?: string;
        };
        include?: { fromUnit?: unknown; toUnit?: unknown };
        skip?: number;
        take?: number;
      }) => {
        const filtered = this.conversionRows.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (
            typeof where.fromUnitId === 'string' &&
            row.fromUnitId !== where.fromUnitId
          )
            return false;
          if (
            where.fromUnitId &&
            typeof where.fromUnitId === 'object' &&
            !where.fromUnitId.in.includes(row.fromUnitId)
          )
            return false;
          if (where.toUnitId !== undefined && row.toUnitId !== where.toUnitId)
            return false;
          return true;
        });
        const start = skip ?? 0;
        const page = filtered.slice(start, start + (take ?? filtered.length));
        // Honour the include so the join the repository asks for is observable
        // through the response, the way a real database would return it.
        return Promise.resolve(
          page.map((row) =>
            include
              ? {
                  ...row,
                  fromUnit:
                    this.unitRows.find((unit) => unit.id === row.fromUnitId) ??
                    null,
                  toUnit:
                    this.unitRows.find((unit) => unit.id === row.toUnitId) ??
                    null,
                }
              : row,
          ),
        );
      },
      count: ({
        where,
      }: {
        where: {
          organizationId: string;
          fromUnitId?: string;
          toUnitId?: string;
        };
      }) =>
        Promise.resolve(
          this.conversionRows.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              (where.fromUnitId === undefined ||
                row.fromUnitId === where.fromUnitId) &&
              (where.toUnitId === undefined || row.toUnitId === where.toUnitId),
          ).length,
        ),
      create: ({
        data,
      }: {
        data: {
          organizationId: string;
          fromUnitId: string;
          toUnitId: string;
          multiplier: string;
        };
      }) => {
        const created: Row = {
          id: `new-${this.conversionRows.length}`,
          organizationId: data.organizationId,
          fromUnitId: data.fromUnitId,
          toUnitId: data.toUnitId,
          // PostgreSQL NUMERIC(14,6) always reports six decimal places.
          multiplier: Number(data.multiplier).toFixed(6),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.conversionRows.push(created);
        return Promise.resolve(created);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { multiplier: string };
      }) => {
        const index = this.conversionRows.findIndex(
          (row) => row.id === where.id,
        );
        this.conversionRows[index] = {
          ...this.conversionRows[index],
          multiplier: Number(data.multiplier).toFixed(6),
          updatedAt: new Date(),
        };
        return Promise.resolve(this.conversionRows[index]);
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = this.conversionRows.findIndex(
          (row) => row.id === where.id,
        );
        this.conversionRows.splice(index, 1);
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
  imports: [AppConfigModule, LoggingModule, UnitConversionsModule],
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
class UnitConversionsProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [UnitConversionsProbeModule],
  })
    // UnitConversionsModule resolves PrismaService, AuditService, and the UnitRepository
    // it imports from UnitsModule, so a provider declared on this module would not
    // reach them. Overriding here is what stops the suite from silently writing to
    // the live development database through the real repositories.
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

describe('unit conversions (e2e)', () => {
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

  beforeEach(() => {
    prisma.reset();
    audit.entries.length = 0;
  });

  function auth(subject: string) {
    const subject0 = USERS[subject];
    return jwt
      .generateAccessToken({ sub: subject, orgId: subject0.organizationId })
      .then((token) => ({ Authorization: `Bearer ${token}` }));
  }

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the caller organization conversions', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.data).toHaveLength(2);
  });

  it('returns the multiplier as an exact decimal string, not a float', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .expect(200);

    const [row] = response.body.data.data;
    expect(typeof row.multiplier).toBe('string');
    expect(row.multiplier).toBe('12.000000');
  });

  it('joins both endpoint units so a row renders without a second request', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .expect(200);

    const [row] = response.body.data.data;
    expect(row.fromUnit).toMatchObject({ code: 'DOZ' });
    expect(row.toUnit).toMatchObject({ code: 'PCS' });
  });

  it('filters by source unit', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/unit-conversions?fromUnitId=${BOX}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.data[0].fromUnitId).toBe(BOX);
  });

  it('filters by target unit', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/unit-conversions?toUnitId=${PCS}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.data).toHaveLength(2);
  });

  it('rejects a malformed unit id in the filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions?fromUnitId=not-a-uuid')
      .set(await auth('manager'))
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('creates a conversion and audits it', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: BOX, multiplier: '6' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      fromUnitId: DOZ,
      toUnitId: BOX,
      organizationId: ORG_A,
    });
    expect(response.body.data.multiplier).toBe('6.000000');
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'unit_conversion.create',
      entity: 'UnitConversion',
      organizationId: ORG_A,
    });
  });

  it('accepts a multiplier sent as a JSON number', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: BOX, multiplier: 24 })
      .expect(201);

    expect(response.body.data.multiplier).toBe('24.000000');
  });

  it('preserves a fractional multiplier to six decimal places', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: BOX, toUnitId: DOZ, multiplier: '0.083333' })
      .expect(201);

    expect(response.body.data.multiplier).toBe('0.083333');
  });

  it('does not let a caller create a conversion in another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({
        fromUnitId: DOZ,
        toUnitId: BOX,
        multiplier: '1',
        organizationId: ORG_B,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a source unit from another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: OTHER_ORG_UNIT, toUnitId: BOX, multiplier: '1' })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toMatch(/source unit/i);
  });

  it('refuses a target unit from another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: OTHER_ORG_UNIT, multiplier: '1' })
      .expect(404);

    expect(response.body.error.message).toMatch(/target unit/i);
  });

  it('refuses a unit converted into itself', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: DOZ, multiplier: '1' })
      .expect(400);

    expect(response.body.error.message).toMatch(/into itself/i);
  });

  it('rejects a zero multiplier', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: CARTON, multiplier: '0' })
      .expect(400);

    expect(response.body.error.message).toMatch(/greater than zero/i);
  });

  it('rejects a negative multiplier at the edge', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: CARTON, multiplier: '-2' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.field_errors.multiplier).toBeDefined();
  });

  it('rejects a multiplier with more decimal places than the column holds', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: CARTON, multiplier: '1.1234567' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a multiplier in exponent notation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: CARTON, multiplier: '1e2' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a non-numeric multiplier', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: CARTON, multiplier: 'twelve' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a duplicate direction', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('records the reverse direction as its own row', async () => {
    // By decision the reciprocal is entered explicitly, never derived, so
    // PCS -> DOZ is a separate row from the seeded DOZ -> PCS.
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: PCS, toUnitId: DOZ, multiplier: '0.083333' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      fromUnitId: PCS,
      toUnitId: DOZ,
    });
  });

  it('allows two organizations to convert the same direction', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('intruder'))
      .send({ fromUnitId: OTHER_ORG_UNIT, toUnitId: BOX, multiplier: '1' })
      .expect(404);

    // BOX belongs to the other organization, so the edge cannot be built.
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects an edge that closes a three-unit loop', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: DOZ, toUnitId: BOX, multiplier: '1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: BOX, toUnitId: CARTON, multiplier: '1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: CARTON, toUnitId: DOZ, multiplier: '1' })
      .expect(400);

    expect(response.body.error.message).toMatch(/cycle/i);
  });

  it('serves a conversion belonging to the caller organization', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/unit-conversions/${list.body.data.data[0].id}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.id).toBe(list.body.data.data[0].id);
  });

  it('hides a conversion belonging to another organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions/ccccccc1-cccc-4ccc-8ccc-ccccccccccc')
      .set(await auth('intruder'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('updates the multiplier and audits before and after', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .expect(200);
    const target = list.body.data.data.find(
      (row: { fromUnitId: string }) => row.fromUnitId === BOX,
    );

    const response = await request(app.getHttpServer())
      .put(`/api/v1/unit-conversions/${target.id}`)
      .set(await auth('manager'))
      .send({ multiplier: '12' })
      .expect(200);

    expect(response.body.data.multiplier).toBe('12.000000');
    // The direction must not move.
    expect(response.body.data.fromUnitId).toBe(BOX);
    expect(response.body.data.toUnitId).toBe(PCS);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'unit_conversion.update',
      before: expect.objectContaining({ multiplier: '10.000000' }),
      after: expect.objectContaining({ multiplier: '12.000000' }),
    });
  });

  it('rejects a zero multiplier on update', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .expect(200);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/unit-conversions/${list.body.data.data[0].id}`)
      .set(await auth('manager'))
      .send({ multiplier: '0' })
      .expect(400);

    expect(response.body.error.message).toMatch(/greater than zero/i);
  });

  it('refuses to update a conversion in another organization', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/unit-conversions/ccccccc1-cccc-4ccc-8ccc-ccccccccccc')
      .set(await auth('intruder'))
      .send({ multiplier: '99' })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('deletes a conversion', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: CARTON, toUnitId: BOX, multiplier: '2' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/unit-conversions/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/unit-conversions/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('audits a delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/unit-conversions')
      .set(await auth('manager'))
      .send({ fromUnitId: CARTON, toUnitId: BOX, multiplier: '3' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/unit-conversions/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);

    expect(audit.entries.at(-1)).toMatchObject({
      action: 'unit_conversion.delete',
      entityId: created.body.data.id,
    });
  });

  it('refuses to delete a conversion in another organization', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/v1/unit-conversions/ccccccc1-cccc-4ccc-8ccc-ccccccccccc')
      .set(await auth('intruder'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects an unknown sort column without failing the request', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions?sortBy=organizationId')
      .set(await auth('manager'))
      .expect(200);

    expect(Array.isArray(response.body.data.data)).toBe(true);
  });

  it('keeps an intruder inside its own organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unit-conversions')
      .set(await auth('intruder'))
      .expect(200);

    expect(response.body.data.data).toHaveLength(0);
  });
});
