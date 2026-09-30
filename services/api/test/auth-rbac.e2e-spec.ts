import 'dotenv/config';
import { Controller, Get, Module, Param, Query, Req } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
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
import { RequirePermissions } from '../src/common/guards/permissions.guard.js';
import { RequireTenantScope } from '../src/common/guards/tenant-scope.guard.js';
import { Public } from '../src/common/decorators/public.decorator.js';
import { PERMISSION } from '../src/auth/permission-codes.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { AuthenticatedUser } from '../src/common/auth/authenticated-user.js';

process.env.JWT_SECRET ??= 'auth-rbac-e2e-test-secret-value-0000000000';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';

function role(
  id: string,
  code: string,
  status: string,
  permissionCodes: string[],
) {
  return {
    id,
    organizationId: ORG_A,
    name: code,
    code,
    status,
    permissions: permissionCodes.map((permissionCode, index) => ({
      roleId: id,
      permissionId: `p-${index}`,
      permission: { id: `p-${index}`, code: permissionCode, status: 'active' },
    })),
  };
}

function user(
  id: string,
  organizationId: string,
  options: {
    status?: string;
    roles?: ReturnType<typeof role>[];
    storeIds?: string[];
  } = {},
) {
  return {
    id,
    organizationId,
    email: `${id}@example.com`,
    name: id,
    status: options.status ?? 'active',
    roles: (options.roles ?? []).map((r) => ({ role: r })),
    storeAccess: (options.storeIds ?? []).map((storeId) => ({
      store: {
        id: storeId,
        code: storeId.slice(0, 4),
        name: `Store ${storeId.slice(0, 4)}`,
      },
    })),
  };
}

const USERS: Record<string, ReturnType<typeof user>> = {
  // Active user holding users:manage through an active role, with store A.
  owner: user('owner', ORG_A, {
    roles: [
      role('r-admin', 'admin', 'active', [
        PERMISSION.usersManage,
        'sales:create',
      ]),
    ],
    storeIds: [STORE_A],
  }),
  // Active user without users:manage.
  cashier: user('cashier', ORG_A, {
    roles: [role('r-cashier', 'cashier', 'active', ['sales:create'])],
    storeIds: [STORE_A],
  }),
  // Holds users:manage, but only through a deactivated role.
  suspended: user('suspended', ORG_A, {
    roles: [
      role('r-suspended', 'suspended', 'inactive', [PERMISSION.usersManage]),
    ],
    storeIds: [STORE_A],
  }),
  // Deactivated account.
  disabled: user('disabled', ORG_A, {
    status: 'inactive',
    roles: [role('r-admin', 'admin', 'active', [PERMISSION.usersManage])],
    storeIds: [STORE_A],
  }),
  // Fully privileged, but in another tenant that only owns store B.
  intruder: user('intruder', ORG_B, {
    roles: [
      role('r-admin', 'admin', 'active', [
        PERMISSION.usersManage,
        'sales:create',
      ]),
    ],
    storeIds: [STORE_B],
  }),
};

class FakePrismaService {
  client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(USERS[where.id] ?? null),
    },
  };
}

@Controller('users')
@RequirePermissions(PERMISSION.usersManage)
@RequireTenantScope()
class UsersProbeController {
  @Get()
  list(@Req() req: Request): { organizationId: string } {
    return { organizationId: (req.user as AuthenticatedUser).organizationId };
  }
}

@Controller('stores/:storeId/sales')
@RequirePermissions('sales:create')
@RequireTenantScope({ store: true })
class StoreSalesProbeController {
  @Get()
  list(
    @Param('storeId') storeId: string,
    @Req() req: Request,
  ): { storeId: string; organizationId: string } {
    return {
      storeId,
      organizationId: (req.user as AuthenticatedUser).organizationId,
    };
  }
}

@Controller('query-sales')
@RequirePermissions('sales:create')
@RequireTenantScope({ store: true })
class QuerySalesProbeController {
  @Get()
  list(@Query('storeId') storeId: string | undefined): {
    storeId: string | undefined;
  } {
    return { storeId };
  }
}

@Controller('public')
class PublicProbeController {
  @Public()
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({
  imports: [AppConfigModule, LoggingModule],
  controllers: [
    UsersProbeController,
    StoreSalesProbeController,
    QuerySalesProbeController,
    PublicProbeController,
  ],
  providers: [
    JwtService,
    { provide: PrismaService, useClass: FakePrismaService },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_PIPE, useValue: createValidationPipe() },
    { provide: APP_INTERCEPTOR, useClass: ResponseFormatInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: TenantScopeGuard },
  ],
})
class AuthRbacProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AuthRbacProbeModule],
  }).compile();
  const app = configureApp(
    moduleFixture.createNestApplication<NestExpressApplication>(),
  );
  await app.init();
  return app;
}

describe('authentication and authorization (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  beforeAll(async () => {
    app = await buildApp();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function accessTokenFor(subject: string): Promise<string> {
    const user = USERS[subject];
    return jwt.generateAccessToken({
      sub: subject,
      orgId: user.organizationId,
    });
  }

  async function refreshTokenFor(subject: string): Promise<string> {
    const user = USERS[subject];
    return jwt.generateRefreshToken({
      sub: subject,
      orgId: user.organizationId,
    });
  }

  it('rejects a protected route without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  it('rejects a refresh token presented as a bearer token', async () => {
    const refreshToken = await refreshTokenFor('owner');
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);
  });

  it('rejects a deactivated account', async () => {
    const token = await accessTokenFor('disabled');
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a caller that lacks the required permission', async () => {
    const token = await accessTokenFor('cashier');
    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.message).toContain(PERMISSION.usersManage);
  });

  it('ignores permissions held only through a deactivated role', async () => {
    const token = await accessTokenFor('suspended');
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a caller that holds the required permission', async () => {
    const token = await accessTokenFor('owner');
    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The organization comes from the principal, never from the request.
    expect(response.body.data.organizationId).toBe(ORG_A);
  });

  it('rejects a store selector the caller has no access to', async () => {
    const token = await accessTokenFor('intruder');
    await request(app.getHttpServer())
      .get(`/api/v1/stores/${STORE_A}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a store selector the caller has access to', async () => {
    const token = await accessTokenFor('intruder');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/stores/${STORE_B}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.organizationId).toBe(ORG_B);
  });

  it('requires an explicit store selector for a store-scoped route', async () => {
    const token = await accessTokenFor('owner');
    await request(app.getHttpServer())
      .get('/api/v1/query-sales')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('reads the store selector from the query string', async () => {
    const token = await accessTokenFor('owner');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/query-sales?storeId=${STORE_A}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.storeId).toBe(STORE_A);
  });

  it('serves a public route without authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/public')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ ok: true });
      });
  });
});
