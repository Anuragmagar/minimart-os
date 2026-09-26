import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { AppConfigService } from '../config/app-config.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import {
  IDEMPOTENCY_CONFLICT_CODE,
  IDEMPOTENCY_IN_PROGRESS_CODE,
  IdempotencyService,
} from './idempotency.service.js';
import type { IdempotencyScope } from './idempotency-scope.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const SCOPE: IdempotencyScope = { organizationId: ORG_ID };

interface FakeRecord {
  id: string;
  organizationId: string;
  storeId: string | null;
  userId: string | null;
  operationKey: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  responseStatus: number | null;
  responseBody: unknown;
  expiresAt: Date;
}

function toJson(value: unknown): unknown {
  return value === undefined ? null : value;
}

function cloneRecord(record: FakeRecord): FakeRecord {
  return { ...record, responseBody: record.responseBody };
}

function createFakeTx(store: Map<string, FakeRecord>) {
  const failCreateOnce = { enabled: false };
  const tx = {
    idempotencyRecord: {
      findUnique: vi.fn(
        async (args: {
          where: {
            organizationId_operationKey: {
              organizationId: string;
              operationKey: string;
            };
          };
        }) => {
          const key = `${args.where.organizationId_operationKey.organizationId}:${args.where.organizationId_operationKey.operationKey}`;
          const record = store.get(key);
          return record ? cloneRecord(record) : null;
        },
      ),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        for (const [key, record] of store) {
          if (record.id === args.where.id) {
            store.delete(key);
            return cloneRecord(record);
          }
        }
        throw new Error('record not found');
      }),
      create: vi.fn(
        async (args: {
          data: {
            organizationId: string;
            storeId?: string;
            userId?: string;
            operationKey: string;
            requestHash: string;
            status: string;
            expiresAt: Date;
          };
        }) => {
          if (failCreateOnce.enabled) {
            failCreateOnce.enabled = false;
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`organization_id`,`operation_key`)',
              { code: 'P2002', clientVersion: '7.10.0' },
            );
          }
          const key = `${args.data.organizationId}:${args.data.operationKey}`;
          if (store.has(key)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`organization_id`,`operation_key`)',
              { code: 'P2002', clientVersion: '7.10.0' },
            );
          }
          const record: FakeRecord = {
            id: `id-${store.size + 1}`,
            organizationId: args.data.organizationId,
            storeId: args.data.storeId ?? null,
            userId: args.data.userId ?? null,
            operationKey: args.data.operationKey,
            requestHash: args.data.requestHash,
            status: args.data.status as FakeRecord['status'],
            responseStatus: null,
            responseBody: null,
            expiresAt: args.data.expiresAt,
          };
          store.set(key, record);
          return cloneRecord(record);
        },
      ),
      update: vi.fn(
        async (args: {
          where: {
            organizationId_operationKey: {
              organizationId: string;
              operationKey: string;
            };
          };
          data: {
            status?: string;
            responseStatus?: number;
            responseBody?: object;
          };
        }) => {
          const key = `${args.where.organizationId_operationKey.organizationId}:${args.where.organizationId_operationKey.operationKey}`;
          const record = store.get(key);
          if (!record) {
            throw new Error('record not found');
          }
          if (args.data.status !== undefined) {
            record.status = args.data.status as FakeRecord['status'];
          }
          if (args.data.responseStatus !== undefined) {
            record.responseStatus = args.data.responseStatus;
          }
          if (args.data.responseBody !== undefined) {
            record.responseBody = args.data.responseBody;
          }
          return cloneRecord(record);
        },
      ),
    },
  };
  return { tx, failCreateOnce };
}

function createService() {
  const configService = {
    getOrThrow: (key: string) =>
      ({
        idempotencyTtlSeconds: 3600,
      })[key],
  } as unknown as ConfigService<AppConfig>;
  const config = new AppConfigService(configService);
  const runInTransaction = vi.fn();
  const prisma = {
    runInTransaction,
  } as unknown as PrismaService;
  const service = new IdempotencyService(prisma, config);
  return { service, runInTransaction };
}

function withFakeTx(
  store: Map<string, FakeRecord>,
  runInTransaction: ReturnType<typeof createService>['runInTransaction'],
) {
  const { tx } = createFakeTx(store);
  runInTransaction.mockImplementation(
    async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  );
  return tx;
}

describe('IdempotencyService', () => {
  it('executes a fresh operation and persists the completed result', async () => {
    const store = new Map<string, FakeRecord>();
    const { service, runInTransaction } = createService();
    withFakeTx(store, runInTransaction);

    const outcome = await service.execute({
      operationKey: 'op-1',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => ({ created: true, operationKey: 'op-1' }),
      responseStatus: 201,
    });

    expect(outcome.outcome).toBe('executed');
    const stored = store.get(`${ORG_ID}:op-1`);
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.responseStatus).toBe(201);
    expect(stored?.responseBody).toEqual({
      created: true,
      operationKey: 'op-1',
    });
  });

  it('replays the stored result for the same key and request hash', async () => {
    const store = new Map<string, FakeRecord>();
    const { service, runInTransaction } = createService();

    let calls = 0;
    runInTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => {
        calls += 1;
        return fn(createFakeTx(store).tx);
      },
    );

    await service.execute({
      operationKey: 'op-2',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => ({ result: 'first' }),
      responseStatus: 200,
    });

    const replay = await service.execute({
      operationKey: 'op-2',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => {
        throw new Error('run must not be invoked on replay');
      },
    });

    expect(calls).toBe(2);
    expect(replay.outcome).toBe('replayed');
    if (replay.outcome === 'replayed') {
      expect(replay.result).toEqual({ result: 'first' });
      expect(replay.responseStatus).toBe(200);
    }
  });

  it('rejects a different request body under the same key', async () => {
    const store = new Map<string, FakeRecord>();
    const { service, runInTransaction } = createService();
    withFakeTx(store, runInTransaction);

    await service.execute({
      operationKey: 'op-3',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => ({ result: 'first' }),
    });

    const conflict = service.execute({
      operationKey: 'op-3',
      scope: SCOPE,
      requestHash: 'hash-B',
      run: async () => ({ result: 'second' }),
    });

    await expect(conflict).rejects.toMatchObject({
      code: IDEMPOTENCY_CONFLICT_CODE,
      statusCode: 409,
    });
  });

  it('rejects a fresh in-progress claim under the same key', async () => {
    const store = new Map<string, FakeRecord>();
    store.set(`${ORG_ID}:op-4`, {
      id: 'id-1',
      organizationId: ORG_ID,
      storeId: null,
      userId: null,
      operationKey: 'op-4',
      requestHash: 'hash-A',
      status: 'IN_PROGRESS',
      responseStatus: null,
      responseBody: null,
      expiresAt: new Date(Date.now() + 100_000),
    });
    const { service, runInTransaction } = createService();
    withFakeTx(store, runInTransaction);

    const inProgress = service.execute({
      operationKey: 'op-4',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => ({ result: 'x' }),
    });

    await expect(inProgress).rejects.toMatchObject({
      code: IDEMPOTENCY_IN_PROGRESS_CODE,
      statusCode: 409,
    });
  });

  it('reclaims an expired in-progress record and executes again', async () => {
    const store = new Map<string, FakeRecord>();
    store.set(`${ORG_ID}:op-5`, {
      id: 'id-1',
      organizationId: ORG_ID,
      storeId: null,
      userId: null,
      operationKey: 'op-5',
      requestHash: 'hash-A',
      status: 'IN_PROGRESS',
      responseStatus: null,
      responseBody: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    const { service, runInTransaction } = createService();
    withFakeTx(store, runInTransaction);

    const outcome = await service.execute({
      operationKey: 'op-5',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => ({ result: 'fresh' }),
    });

    expect(outcome.outcome).toBe('executed');
    expect(store.get(`${ORG_ID}:op-5`)?.status).toBe('COMPLETED');
  });

  it('replays an expired completed record instead of re-executing', async () => {
    const store = new Map<string, FakeRecord>();
    store.set(`${ORG_ID}:op-8`, {
      id: 'id-1',
      organizationId: ORG_ID,
      storeId: null,
      userId: null,
      operationKey: 'op-8',
      requestHash: 'hash-A',
      status: 'COMPLETED',
      responseStatus: 200,
      responseBody: { result: 'first' },
      expiresAt: new Date(Date.now() - 1000),
    });
    const { service, runInTransaction } = createService();
    withFakeTx(store, runInTransaction);

    const outcome = await service.execute({
      operationKey: 'op-8',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => {
        throw new Error('run must not be invoked');
      },
    });

    expect(outcome.outcome).toBe('replayed');
    expect(store.get(`${ORG_ID}:op-8`)?.status).toBe('COMPLETED');
  });

  it('retries when a concurrent create hits a unique violation and then succeeds', async () => {
    const store = new Map<string, FakeRecord>();
    const { tx, failCreateOnce } = createFakeTx(store);
    const { service, runInTransaction } = createService();

    let txCounter = 0;
    runInTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => {
        txCounter += 1;
        if (txCounter === 1) {
          failCreateOnce.enabled = true;
        }
        return fn(tx);
      },
    );

    const outcome = await service.execute({
      operationKey: 'op-6',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => ({ result: 'ok' }),
    });

    expect(txCounter).toBe(2);
    expect(outcome.outcome).toBe('executed');
  });

  it('serializes an undefined result as JSON-null in the stored body', async () => {
    const store = new Map<string, FakeRecord>();
    const { service, runInTransaction } = createService();
    withFakeTx(store, runInTransaction);

    await service.execute({
      operationKey: 'op-7',
      scope: SCOPE,
      requestHash: 'hash-A',
      run: async () => undefined,
    });

    const stored = store.get(`${ORG_ID}:op-7`);
    expect(toJson(stored?.responseBody)).toBeNull();
    expect(stored?.responseStatus).toBe(200);
  });
});
