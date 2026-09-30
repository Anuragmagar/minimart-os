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
import { BrandsModule } from '../src/brands/brands.module.js';

process.env.JWT_SECRET ??= 'brands-e2e-test-secret-value-000000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BRAND_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRAND_REFERENCED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BRAND_OTHER_ORG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

/** Brands that stand in for the catalog, per organization. */
const BRANDS = [
  {
    id: BRAND_A,
    organizationId: ORG_A,
    name: 'Everest Foods',
    status: 'active',
  },
  {
    id: BRAND_REFERENCED,
    organizationId: ORG_A,
    name: 'City Fresh',
    status: 'active',
  },
  {
    id: BRAND_OTHER_ORG,
    organizationId: ORG_B,
    name: 'Foreign',
    status: 'active',
  },
];

/** Ids of brands that products still point at. */
const REFERENCED_BRAND_IDS = new Set([BRAND_REFERENCED]);

class FakePrismaService {
  readonly rows = [...BRANDS];

  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
    product: {
      count: ({ where }: { where: { brandId: string } }) =>
        Promise.resolve(REFERENCED_BRAND_IDS.has(where.brandId) ? 2 : 0),
    },
    brand: {
      findFirst: ({
        where,
      }: {
        where: { id?: string; name?: string; organizationId: string };
      }) => {
        const hit = this.rows.find(
          (row) =>
            row.organizationId === where.organizationId &&
            (where.id === undefined || row.id === where.id) &&
            (where.name === undefined || row.name === where.name),
        );
        return Promise.resolve(hit ?? null);
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `new-${this.rows.length}`,
          organizationId: String(data.organizationId),
          name: String(data.name),
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
          name?: { contains: string; mode: string };
        };
      }) =>
        Promise.resolve(
          this.rows.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              (where.status === undefined || row.status === where.status) &&
              (where.name === undefined ||
                row.name
                  .toLowerCase()
                  .includes(where.name.contains.toLowerCase())),
          ),
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
  imports: [AppConfigModule, LoggingModule, BrandsModule],
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
class BrandsProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [BrandsProbeModule],
  })
    // BrandsModule resolves its own PrismaService and AuditService, so a
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

describe('brands (e2e)', () => {
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
    await request(app.getHttpServer()).get('/api/v1/brands').expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/brands')
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the caller organization brands', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/brands')
      .set(await auth('manager'))
      .expect(200);

    const names = response.body.data.data.map(
      (row: { name: string }) => row.name,
    );
    expect(names).toEqual(['Everest Foods', 'City Fresh']);
    expect(names).not.toContain('Foreign');
  });

  it('wraps a successful response in the canonical envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/brands')
      .set(await auth('manager'))
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('creates a brand and audits it', async () => {
    const before = audit.entries.length;
    const response = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({ name: 'Himalaya New' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: 'Himalaya New',
      status: 'active',
      organizationId: ORG_A,
    });
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'brand.create',
      entity: 'Brand',
      organizationId: ORG_A,
    });
  });

  it('does not let a caller create a brand inside another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({ name: 'Injected', organizationId: ORG_B })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');

    const list = await request(app.getHttpServer())
      .get('/api/v1/brands')
      .set(await auth('manager'))
      .expect(200);
    const names = list.body.data.data.map((row: { name: string }) => row.name);
    expect(names).not.toContain('Injected');
  });

  it('rejects a create with no name', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({})
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a duplicate name in the same organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({ name: 'Everest Foods' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('serves a brand belonging to the caller organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${BRAND_A}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: BRAND_A,
      name: 'Everest Foods',
    });
  });

  it('hides a brand belonging to another organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${BRAND_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).not.toContain(BRAND_OTHER_ORG);
  });

  it('updates a brand and audits before and after', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({ name: 'Rename Target' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/brands/${created.body.data.id}`)
      .set(await auth('manager'))
      .send({ name: 'Renamed' })
      .expect(200);

    expect(response.body.data.name).toBe('Renamed');
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'brand.update',
      before: expect.objectContaining({ name: 'Rename Target' }),
      after: expect.objectContaining({ name: 'Renamed' }),
    });
  });

  it('refuses to update a brand in another organization', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/brands/${BRAND_OTHER_ORG}`)
      .set(await auth('manager'))
      .send({ name: 'Hijacked' })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses a rename that collides with another brand', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/brands/${BRAND_REFERENCED}`)
      .set(await auth('manager'))
      .send({ name: 'Everest Foods' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('deactivates a brand', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({ name: 'Doomed' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/brands/${created.body.data.id}/deactivate`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.status).toBe('inactive');
    expect(audit.entries.at(-1)).toMatchObject({ action: 'brand.deactivate' });
  });

  it('refuses to delete a brand that products still reference', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/brands/${BRAND_REFERENCED}`)
      .set(await auth('manager'))
      .expect(400);

    expect(response.body.error.message).toMatch(/deactivate/i);
  });

  it('deletes an unreferenced brand', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({ name: 'Temporary' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/brands/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/brands/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('refuses to delete a brand in another organization', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/brands/${BRAND_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');

    const stillThere = await request(app.getHttpServer())
      .get(`/api/v1/brands/${BRAND_OTHER_ORG}`)
      .set(await auth('intruder'))
      .expect(200);
    expect(stillThere.body.data.name).toBe('Foreign');
  });

  it('filters the list by status', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set(await auth('manager'))
      .send({ name: 'Filtered Out' })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${created.body.data.id}/deactivate`)
      .set(await auth('manager'))
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/brands?status=inactive')
      .set(await auth('manager'))
      .expect(200);

    const names = response.body.data.data.map(
      (row: { name: string }) => row.name,
    );
    expect(names).toContain('Filtered Out');
    expect(names).not.toContain('Everest Foods');
  });

  it('rejects an unknown sort column without failing the request', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/brands?sortBy=organizationId')
      .set(await auth('manager'))
      .expect(200);

    expect(Array.isArray(response.body.data.data)).toBe(true);
  });

  it('keeps an intruder inside its own organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/brands')
      .set(await auth('intruder'))
      .expect(200);

    const names = response.body.data.data.map(
      (row: { name: string }) => row.name,
    );
    expect(names).toEqual(['Foreign']);
  });
});
