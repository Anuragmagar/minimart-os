import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/database/prisma.service.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { OrganizationRepository } from '../../src/organizations/organization.repository.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { IdempotencyService } from '../../src/idempotency/idempotency.service.js';
import { provisionTestDatabase, resolveTestUrl } from './db-test-db.helper.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const STORE_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

let app: INestApplication<NestExpressApplication>;
let moduleFixture: TestingModule;
let prisma: PrismaService;
let configService: AppConfigService;
let orgRepo: OrganizationRepository;
let auditService: AuditService;
let idempotencyService: IdempotencyService;
let testDbUrl: string;

beforeAll(async () => {
  testDbUrl = await provisionTestDatabase();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is required for database integration tests');
  }
  const _adminUrl = resolveTestUrl(baseUrl).replace(
    '/minimart_test',
    '/postgres',
  );

  const values = {
    nodeEnv: 'test',
    port: 4000,
    host: '0.0.0.0',
    databaseUrl: testDbUrl,
    redisUrl: 'redis://localhost:6379',
    tz: 'Asia/Kathmandu',
    apiPrefix: 'api',
    apiVersion: 'v1',
    logLevel: 'fatal' as const,
    bodyLimit: '1mb',
    argon2MemoryCost: 19456,
    argon2TimeCost: 2,
    argon2Parallelism: 1,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604800,
    idempotencyTtlSeconds: 3600,
  };

  const mockConfigService = {
    get nodeEnv() {
      return values.nodeEnv;
    },
    get port() {
      return values.port;
    },
    get host() {
      return values.host;
    },
    get databaseUrl() {
      return values.databaseUrl;
    },
    get redisUrl() {
      return values.redisUrl;
    },
    get tz() {
      return values.tz;
    },
    get apiPrefix() {
      return values.apiPrefix;
    },
    get apiVersion() {
      return values.apiVersion;
    },
    get logLevel() {
      return values.logLevel;
    },
    get bodyLimit() {
      return values.bodyLimit;
    },
    get argon2MemoryCost() {
      return values.argon2MemoryCost;
    },
    get argon2TimeCost() {
      return values.argon2TimeCost;
    },
    get argon2Parallelism() {
      return values.argon2Parallelism;
    },
    get accessTokenTtlSeconds() {
      return values.accessTokenTtlSeconds;
    },
    get refreshTokenTtlSeconds() {
      return values.refreshTokenTtlSeconds;
    },
    get idempotencyTtlSeconds() {
      return values.idempotencyTtlSeconds;
    },
  };

  moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AppConfigService)
    .useValue(mockConfigService)
    .compile();

  app = configureApp(
    moduleFixture.createNestApplication<NestExpressApplication>(),
  );
  await app.init();

  prisma = moduleFixture.get(PrismaService);
  configService = moduleFixture.get(AppConfigService);
  orgRepo = moduleFixture.get(OrganizationRepository);
  auditService = moduleFixture.get(AuditService);
  idempotencyService = moduleFixture.get(IdempotencyService);

  await prisma.client.$connect();

  await prisma.client.organization.deleteMany({ where: { id: ORG_ID } });
  await prisma.client.organization.create({
    data: {
      id: ORG_ID,
      name: 'Integration Test Org',
      legalName: 'Integration Test Org Pvt Ltd',
      currency: 'NPR',
    },
  });

  // Create store for audit tests (FK required)
  await prisma.client.store.deleteMany({ where: { id: STORE_ID } });
  await prisma.client.store.create({
    data: {
      id: STORE_ID,
      organizationId: ORG_ID,
      name: 'Integration Test Store',
      code: 'ITS',
      status: 'active',
    },
  });
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.client.auditLog.deleteMany({
    where: { organizationId: ORG_ID },
  });
  await prisma.client.idempotencyRecord.deleteMany({
    where: { organizationId: ORG_ID },
  });
  await prisma.client.store.deleteMany({ where: { id: STORE_ID } });
  await prisma.client.organization.deleteMany({ where: { id: ORG_ID } });
  await prisma.onModuleDestroy();
  if (app) {
    await app.close();
  }
});

describe('Core Infrastructure Integration', () => {
  describe('HTTP Stack', () => {
    it('GET /api/v1 returns Hello World with response envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1')
        .expect(200);

      expect(response.body).toEqual({
        data: 'Hello World!',
        meta: {},
      });
    });

    it('GET /api/v1/health returns ok with response envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.data).toMatchObject({
        status: 'ok',
        service: 'minimart-api',
      });
      expect(typeof response.body.data.timestamp).toBe('string');
      expect(response.body.meta).toEqual({});
    });

    it('GET /api/v1/unknown returns canonical 404 error', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/unknown')
        .expect(404);

      expect(response.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Cannot GET /api/v1/unknown',
          details: {},
          field_errors: {},
          request_id: expect.any(String),
        },
      });
    });

    it('generates request_id when x-correlation-id header is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/unknown')
        .set('x-correlation-id', 'test-corr-123')
        .expect(404);

      expect(response.body.error.request_id).toBe('test-corr-123');
    });

    it('generates request_id when no header is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/unknown')
        .expect(404);

      expect(response.body.error.request_id).toEqual(expect.any(String));
      expect(response.body.error.request_id.length).toBeGreaterThan(0);
    });
  });

  describe('OrganizationRepository (via DI)', () => {
    it('findById returns organization from real database', async () => {
      const org = await orgRepo.findById(ORG_ID);
      expect(org).not.toBeNull();
      expect(org!.id).toBe(ORG_ID);
      expect(org!.name).toBe('Integration Test Org');
    });

    it('findById returns null for non-existent id', async () => {
      const org = await orgRepo.findById(
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
      );
      expect(org).toBeNull();
    });
  });

  describe('PrismaService.runInTransaction', () => {
    it('commits when handler returns successfully', async () => {
      const testOrgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      await prisma.client.organization.deleteMany({ where: { id: testOrgId } });

      await prisma.runInTransaction(async (tx) => {
        await tx.organization.create({
          data: {
            id: testOrgId,
            name: 'Tx Commit Org',
            legalName: 'Tx Commit Org Pvt Ltd',
            currency: 'NPR',
          },
        });
      });

      const org = await prisma.client.organization.findUnique({
        where: { id: testOrgId },
      });
      expect(org).not.toBeNull();
      expect(org!.name).toBe('Tx Commit Org');
    });

    it('rolls back when handler throws', async () => {
      const testOrgId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      await prisma.client.organization.deleteMany({ where: { id: testOrgId } });

      await expect(
        prisma.runInTransaction(async (tx) => {
          await tx.organization.create({
            data: {
              id: testOrgId,
              name: 'Tx Rollback Org',
              legalName: 'Tx Rollback Org Pvt Ltd',
              currency: 'NPR',
            },
          });
          throw new Error('intentional rollback');
        }),
      ).rejects.toThrow('intentional rollback');

      const org = await prisma.client.organization.findUnique({
        where: { id: testOrgId },
      });
      expect(org).toBeNull();
    });

    it('repository inside transaction sees uncommitted writes', async () => {
      const testOrgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await prisma.client.organization.deleteMany({ where: { id: testOrgId } });

      await prisma.runInTransaction(async (tx) => {
        await tx.organization.create({
          data: {
            id: testOrgId,
            name: 'Tx Visible Org',
            legalName: 'Tx Visible Org Pvt Ltd',
            currency: 'NPR',
          },
        });

        const org = await orgRepo.findById(testOrgId, tx);
        expect(org).not.toBeNull();
        expect(org!.name).toBe('Tx Visible Org');
      });

      const org = await prisma.client.organization.findUnique({
        where: { id: testOrgId },
      });
      expect(org).not.toBeNull();
    });
  });

  describe('AuditService (via DI)', () => {
    it('records audit log with sanitization', async () => {
      const entry = {
        organizationId: ORG_ID,
        storeId: STORE_ID,
        action: 'TEST_ACTION',
        entity: 'TestEntity',
        entityId: 'TEST-123',
        before: {
          password: 'secret123',
          passwordHash: 'hashed-secret',
          token: 'access-token',
          accessToken: 'access-token-value',
          refreshToken: 'refresh-token-value',
          secret: 'api-secret',
          apiKey: 'api-key-value',
          cardNumber: '4111-1111-1111-1111',
          panNumber: 'ABCDE1234F',
          normalField: 'should remain',
        },
        after: {
          token: 'new-token',
          normalField: 'updated',
        },
      };

      await auditService.record(entry);

      const auditLogs = await prisma.client.auditLog.findMany({
        where: { organizationId: ORG_ID, entityId: 'TEST-123' },
        orderBy: { createdAt: 'asc' },
      });

      expect(auditLogs).toHaveLength(1);
      const log = auditLogs[0];

      expect(log.organizationId).toBe(ORG_ID);
      expect(log.storeId).toBe(STORE_ID);
      expect(log.userId).toBeNull();
      expect(log.action).toBe('TEST_ACTION');
      expect(log.entity).toBe('TestEntity');
      expect(log.entityId).toBe('TEST-123');

      const before = log.before as Record<string, unknown>;
      const after = log.after as Record<string, unknown>;

      expect(before.password).toBe('[REDACTED]');
      expect(before.passwordHash).toBe('[REDACTED]');
      expect(before.token).toBe('[REDACTED]');
      expect(before.accessToken).toBe('[REDACTED]');
      expect(before.refreshToken).toBe('[REDACTED]');
      expect(before.secret).toBe('[REDACTED]');
      expect(before.apiKey).toBe('[REDACTED]');
      expect(before.cardNumber).toBe('[REDACTED]');
      expect(before.panNumber).toBe('[REDACTED]');
      expect(before.normalField).toBe('should remain');

      expect(after.token).toBe('[REDACTED]');
      expect(after.normalField).toBe('updated');
    });

    it('records audit log with omitted before/after as null', async () => {
      const entry = {
        organizationId: ORG_ID,
        action: 'TEST_ACTION_NO_BEFORE_AFTER',
        entity: 'TestEntity',
        entityId: 'TEST-456',
      };

      await auditService.record(entry);

      const auditLogs = await prisma.client.auditLog.findMany({
        where: { organizationId: ORG_ID, entityId: 'TEST-456' },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].before).toBeNull();
      expect(auditLogs[0].after).toBeNull();
    });
  });

  describe('IdempotencyService (via DI)', () => {
    const scope = {
      organizationId: ORG_ID,
      storeId: STORE_ID,
      userId: USER_ID,
    };

    it('executes once and replays for the same key and request hash', async () => {
      let runCount = 0;
      const operationKey = 'int-op-1';
      const requestHash = 'hash-A';

      const outcome1 = await idempotencyService.execute({
        operationKey,
        scope,
        requestHash,
        run: async () => {
          runCount += 1;
          return { orderId: 'ORD-INT-1', ok: true };
        },
      });

      expect(outcome1.outcome).toBe('executed');
      expect(runCount).toBe(1);

      const outcome2 = await idempotencyService.execute({
        operationKey,
        scope,
        requestHash,
        run: async () => {
          runCount += 1;
          return { orderId: 'ORD-INT-2', ok: true };
        },
      });

      expect(outcome2.outcome).toBe('replayed');
      expect(runCount).toBe(1);
      expect(outcome2.result).toEqual({ orderId: 'ORD-INT-1', ok: true });
    });

    it('returns conflict when same key is used with different request hash', async () => {
      const operationKey = 'int-op-2';

      await idempotencyService.execute({
        operationKey,
        scope,
        requestHash: 'hash-B',
        run: async () => ({ amount: 100 }),
      });

      await expect(
        idempotencyService.execute({
          operationKey,
          scope,
          requestHash: 'hash-C',
          run: async () => ({ amount: 200 }),
        }),
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
        statusCode: 409,
      });
    });

    it('persists idempotency record with completed status', async () => {
      const operationKey = 'int-op-3';
      const requestHash = 'hash-D';

      await idempotencyService.execute({
        operationKey,
        scope,
        requestHash,
        run: async () => ({ result: 'success' }),
      });

      const record = await prisma.client.idempotencyRecord.findUnique({
        where: {
          organizationId_operationKey: { organizationId: ORG_ID, operationKey },
        },
      });

      expect(record).not.toBeNull();
      expect(record!.status).toBe('COMPLETED');
      expect(record!.requestHash).toBe(requestHash);
      expect(record!.responseBody).toEqual({ result: 'success' });
    });

    it('rolls back idempotency record when handler throws', async () => {
      const operationKey = 'int-op-4';
      const requestHash = 'hash-E';

      await expect(
        idempotencyService.execute({
          operationKey,
          scope,
          requestHash,
          run: async () => {
            throw new Error('handler failed');
          },
        }),
      ).rejects.toThrow('handler failed');

      const record = await prisma.client.idempotencyRecord.findUnique({
        where: {
          organizationId_operationKey: { organizationId: ORG_ID, operationKey },
        },
      });

      expect(record).toBeNull();
    });
  });

  describe('Full Stack Integration', () => {
    it('core modules are all wired and functional together', async () => {
      const scope = {
        organizationId: ORG_ID,
        storeId: STORE_ID,
        userId: USER_ID,
      };

      expect(prisma).toBeDefined();
      expect(configService).toBeDefined();
      expect(orgRepo).toBeDefined();
      expect(auditService).toBeDefined();
      expect(idempotencyService).toBeDefined();

      const org = await orgRepo.findById(ORG_ID);
      expect(org).not.toBeNull();

      await auditService.record({
        organizationId: ORG_ID,
        action: 'FULL_STACK_TEST',
        entity: 'FullStack',
        entityId: 'FS-1',
      });

      const audit = await prisma.client.auditLog.findFirst({
        where: { organizationId: ORG_ID, entityId: 'FS-1' },
      });
      expect(audit).not.toBeNull();

      await idempotencyService.execute({
        operationKey: 'full-stack-op',
        scope,
        requestHash: 'full-stack-hash',
        run: async () => ({ integrated: true }),
      });

      const idem = await prisma.client.idempotencyRecord.findUnique({
        where: {
          organizationId_operationKey: {
            organizationId: ORG_ID,
            operationKey: 'full-stack-op',
          },
        },
      });
      expect(idem).not.toBeNull();
      expect(idem!.status).toBe('COMPLETED');
    });
  });
});
