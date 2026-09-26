import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../src/config/configuration.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import type { AppError } from '../../src/common/errors/app-error.js';
import {
  IDEMPOTENCY_CONFLICT_CODE,
  IDEMPOTENCY_IN_PROGRESS_CODE,
  IdempotencyService,
} from '../../src/idempotency/idempotency.service.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

const ORG_ID = '22222222-2222-2222-2222-222222222222';
const STORE_ID = '33333333-3333-3333-3333-333333333333';

let prisma: PrismaService;
let service: IdempotencyService;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const values: Record<keyof AppConfig, unknown> = {
    nodeEnv: 'test',
    port: 4000,
    host: '0.0.0.0',
    databaseUrl: url,
    redisUrl: 'redis://localhost:6379',
    tz: 'Asia/Kathmandu',
    apiPrefix: 'api',
    apiVersion: 'v1',
    logLevel: 'info',
    bodyLimit: '1mb',
    argon2MemoryCost: 19456,
    argon2TimeCost: 2,
    argon2Parallelism: 1,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604800,
    idempotencyTtlSeconds: 3600,
  };
  const configService = {
    getOrThrow: (key: string) => values[key as keyof AppConfig],
  } as ConfigService<AppConfig>;
  prisma = new PrismaService(new AppConfigService(configService));
  await prisma.client.$connect();
  await prisma.client.idempotencyRecord.deleteMany({});
  await prisma.client.organization.deleteMany({ where: { id: ORG_ID } });
  await prisma.client.organization.create({
    data: {
      id: ORG_ID,
      name: 'Idempotency Org',
      legalName: 'Idempotency Org Pvt Ltd',
      currency: 'NPR',
    },
  });
  service = new IdempotencyService(prisma, new AppConfigService(configService));
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.client.idempotencyRecord.deleteMany({});
  await prisma.client.organization.deleteMany({ where: { id: ORG_ID } });
  await prisma.onModuleDestroy();
});

function scope() {
  return {
    organizationId: ORG_ID,
    storeId: STORE_ID,
  };
}

describe('IdempotencyService integration', () => {
  it('executes once and replays for the same key and request hash', async () => {
    let runCount = 0;
    const outcome = await service.execute({
      operationKey: 'int-op-1',
      scope: scope(),
      requestHash: 'hash-A',
      run: async () => {
        runCount += 1;
        return { orderId: 'ORD-1', total: 125.5 };
      },
      responseStatus: 201,
    });
    expect(outcome.outcome).toBe('executed');
    expect(runCount).toBe(1);

    const replay = await service.execute({
      operationKey: 'int-op-1',
      scope: scope(),
      requestHash: 'hash-A',
      run: async () => {
        runCount += 1;
        return { duplicate: true };
      },
    });
    expect(replay.outcome).toBe('replayed');
    if (replay.outcome === 'replayed') {
      expect(replay.result).toEqual({ orderId: 'ORD-1', total: 125.5 });
      expect(replay.responseStatus).toBe(201);
    }
    expect(runCount).toBe(1);
  });

  it('persists the completed record with the response status', async () => {
    await service.execute({
      operationKey: 'int-op-2',
      scope: scope(),
      requestHash: 'hash-B',
      run: async () => ({ ok: true }),
      responseStatus: 200,
    });
    const record = await prisma.client.idempotencyRecord.findUnique({
      where: {
        organizationId_operationKey: {
          organizationId: ORG_ID,
          operationKey: 'int-op-2',
        },
      },
    });
    expect(record?.status).toBe('COMPLETED');
    expect(record?.responseStatus).toBe(200);
    expect(record?.requestHash).toBe('hash-B');
    expect(record?.storeId).toBe(STORE_ID);
  });

  it('rolls back the claim when the handler fails so a retry is clean', async () => {
    await expect(
      service.execute({
        operationKey: 'int-op-3',
        scope: scope(),
        requestHash: 'hash-C',
        run: async () => {
          throw new Error('handler boom');
        },
      }),
    ).rejects.toThrow('handler boom');

    const missing = await prisma.client.idempotencyRecord.findUnique({
      where: {
        organizationId_operationKey: {
          organizationId: ORG_ID,
          operationKey: 'int-op-3',
        },
      },
    });
    expect(missing).toBeNull();

    const retry = await service.execute({
      operationKey: 'int-op-3',
      scope: scope(),
      requestHash: 'hash-C',
      run: async () => ({ recovered: true }),
    });
    expect(retry.outcome).toBe('executed');
  });

  it('conflicts when the same key is used with a different request hash', async () => {
    await service.execute({
      operationKey: 'int-op-4',
      scope: scope(),
      requestHash: 'hash-D1',
      run: async () => ({ v: 1 }),
    });
    let caught: AppError | undefined;
    try {
      await service.execute({
        operationKey: 'int-op-4',
        scope: scope(),
        requestHash: 'hash-D2',
        run: async () => ({ v: 2 }),
      });
    } catch (error) {
      caught = error as AppError;
    }
    expect(caught?.code).toBe(IDEMPOTENCY_CONFLICT_CODE);
    expect(caught?.statusCode).toBe(409);
  });

  it('rejects a fresh in-progress claim for the same key', async () => {
    const claim = await prisma.client.idempotencyRecord.create({
      data: {
        organizationId: ORG_ID,
        storeId: STORE_ID,
        operationKey: 'int-op-5',
        requestHash: 'hash-E',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    let caught: AppError | undefined;
    try {
      await service.execute({
        operationKey: 'int-op-5',
        scope: scope(),
        requestHash: 'hash-E',
        run: async () => ({ x: 1 }),
      });
    } catch (error) {
      caught = error as AppError;
    }
    expect(caught?.code).toBe(IDEMPOTENCY_IN_PROGRESS_CODE);
    expect(caught?.statusCode).toBe(409);
    await prisma.client.idempotencyRecord.delete({ where: { id: claim.id } });
  });

  it('uses the resolved response status when provided', async () => {
    const outcome = await service.execute({
      operationKey: 'int-op-6',
      scope: scope(),
      requestHash: 'hash-F',
      resolveResponseStatus: () => 202,
      run: async () => ({ accepted: true }),
    });
    expect(outcome.outcome).toBe('executed');
    if (outcome.outcome === 'executed') {
      expect(outcome.responseStatus).toBe(202);
    }
  });
});
