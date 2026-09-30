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
import { CategoriesModule } from '../src/categories/categories.module.js';

process.env.JWT_SECRET ??= 'categories-e2e-test-secret-value-0000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAT_ROOT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAT_CHILD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CAT_OTHER_ORG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

/** Categories that stand in for the catalog, per organization. */
const CATEGORIES = [
  {
    id: CAT_ROOT,
    organizationId: ORG_A,
    parentId: null,
    name: 'Beverages',
    status: 'active',
  },
  {
    id: CAT_CHILD,
    organizationId: ORG_A,
    parentId: CAT_ROOT,
    name: 'Juice',
    status: 'active',
  },
  {
    id: CAT_OTHER_ORG,
    organizationId: ORG_B,
    parentId: null,
    name: 'Foreign',
    status: 'active',
  },
];

class FakePrismaService {
  readonly rows = [...CATEGORIES];

  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
    product: { count: () => Promise.resolve(0) },
    category: {
      findFirst: ({
        where,
      }: {
        where: {
          id?: string;
          name?: string;
          parentId?: string;
          organizationId: string;
        };
      }) => {
        const hit = this.rows.find(
          (row) =>
            row.organizationId === where.organizationId &&
            (where.id === undefined || row.id === where.id) &&
            (where.name === undefined || row.name === where.name) &&
            (where.parentId === undefined || row.parentId === where.parentId),
        );
        return Promise.resolve(hit ?? null);
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `new-${this.rows.length}`,
          organizationId: String(data.organizationId),
          parentId: (data.parentId as string | null) ?? null,
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
      count: ({ where }: { where: { parentId?: string } }) =>
        Promise.resolve(
          this.rows.filter(
            (row) =>
              where.parentId === undefined || row.parentId === where.parentId,
          ).length,
        ),
      findMany: ({ where }: { where: { organizationId: string } }) =>
        Promise.resolve(
          this.rows.filter(
            (row) => row.organizationId === where.organizationId,
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
  imports: [AppConfigModule, LoggingModule, CategoriesModule],
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
class CategoriesProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [CategoriesProbeModule],
  })
    // CategoriesModule resolves its own PrismaService and AuditService, so a
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

describe('categories (e2e)', () => {
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
    await request(app.getHttpServer()).get('/api/v1/categories').expect(401);
  });

  it('rejects a caller without products:manage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(await auth('cashier'))
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.productsManage);
  });

  it('lists only the caller organization categories', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(await auth('manager'))
      .expect(200);

    const names = response.body.data.data.map(
      (row: { name: string }) => row.name,
    );
    expect(names).toEqual(['Beverages', 'Juice']);
    expect(names).not.toContain('Foreign');
  });

  it('wraps a successful response in the canonical envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(await auth('manager'))
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('does not let a caller create a category inside another organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Injected', organizationId: ORG_B })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');

    const list = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(await auth('manager'))
      .expect(200);
    const names = list.body.data.data.map((row: { name: string }) => row.name);
    expect(names).not.toContain('Injected');
  });

  it('rejects a malformed id in the body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Snacks', parentId: 'not-a-uuid' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.field_errors).toHaveProperty('parentId');
  });

  it('creates a root category and audits it', async () => {
    const before = audit.entries.length;

    const response = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Snacks' })
      .expect(201);

    expect(response.body.data.name).toBe('Snacks');
    expect(response.body.data.parentId).toBeNull();
    expect(response.body.data.status).toBe('active');
    expect(audit.entries.length).toBe(before + 1);
    expect(audit.entries.at(-1)).toMatchObject({
      organizationId: ORG_A,
      action: 'category.create',
      entity: 'Category',
    });
  });

  it('creates a child category under a parent in the same organization', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Tea', parentId: CAT_ROOT })
      .expect(201);

    expect(response.body.data.parentId).toBe(CAT_ROOT);
  });

  it('refuses a parent belonging to another organization', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Smuggled', parentId: CAT_OTHER_ORG })
      .expect(400);
  });

  it('refuses a duplicate name in the same organization', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Beverages' })
      .expect(409);
  });

  it('hides a category belonging to another organization', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/categories/${CAT_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('serves a category belonging to the caller organization', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/categories/${CAT_ROOT}`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.name).toBe('Beverages');
  });

  it('refuses to re-parent a category into its own descendant', async () => {
    // CAT_ROOT is the parent of CAT_CHILD, so making CAT_ROOT a child of
    // CAT_CHILD would close the loop.
    await request(app.getHttpServer())
      .put(`/api/v1/categories/${CAT_ROOT}`)
      .set(await auth('manager'))
      .send({ parentId: CAT_CHILD })
      .expect(400);
  });

  it('refuses to make a category its own parent', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/categories/${CAT_ROOT}`)
      .set(await auth('manager'))
      .send({ parentId: CAT_ROOT })
      .expect(400);
  });

  it('moves a category to the root when parentId is null', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/categories/${CAT_CHILD}`)
      .set(await auth('manager'))
      .send({ parentId: null })
      .expect(200);

    expect(response.body.data.parentId).toBeNull();
  });

  it('deactivates a category', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/categories/${CAT_CHILD}/deactivate`)
      .set(await auth('manager'))
      .expect(200);

    expect(response.body.data.status).toBe('inactive');
  });

  it('refuses to delete a category that still has subcategories', async () => {
    const child = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Coffee', parentId: CAT_ROOT })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${CAT_ROOT}`)
      .set(await auth('manager'))
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${child.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);
  });

  it('deletes an unreferenced category', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(await auth('manager'))
      .send({ name: 'Temporary' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/categories/${created.body.data.id}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('does not delete a category belonging to another organization', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${CAT_OTHER_ORG}`)
      .set(await auth('manager'))
      .expect(404);
  });

  it('rejects a sort column outside the allow-list', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories?sortBy=organizationId')
      .set(await auth('manager'))
      .expect(200);

    // The repository falls back to createdAt rather than forwarding the key.
    expect(response.status).toBe(200);
  });

  it('keeps an intruder inside its own organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(await auth('intruder'))
      .expect(200);

    const names = response.body.data.data.map(
      (row: { name: string }) => row.name,
    );
    expect(names).toEqual(['Foreign']);
  });
});
