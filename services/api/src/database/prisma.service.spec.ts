import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from './prisma.service.js';

function createConfigService(): ConfigService<AppConfig> {
  const values: Record<keyof AppConfig, unknown> = {
    nodeEnv: 'test',
    port: 4000,
    host: '0.0.0.0',
    databaseUrl: 'postgres://u:p@db:5432/test',
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
    idempotencyTtlSeconds: 86400,
  };
  return {
    getOrThrow: (key: string) => values[key as keyof AppConfig],
  } as ConfigService<AppConfig>;
}

describe('PrismaService', () => {
  it('creates a PrismaClient for the configured database url', () => {
    const service = new PrismaService(
      new AppConfigService(createConfigService()),
    );
    expect(service.client).toBeDefined();
    expect(service.client.organization).toBeDefined();
  });

  it('disconnects the client on module destroy', async () => {
    const service = new PrismaService(
      new AppConfigService(createConfigService()),
    );
    const disconnect = vi
      .spyOn(service.client, '$disconnect')
      .mockResolvedValueOnce();
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('runInTransaction delegates to the interactive transaction and resolves the callback result', async () => {
    const service = new PrismaService(
      new AppConfigService(createConfigService()),
    );
    const result = { ok: true };
    const txSpy = vi
      .spyOn(service.client, '$transaction')
      .mockImplementation(async (fn) => {
        return (fn as (tx: unknown) => Promise<unknown>)({ tx: 'proxy' });
      });

    const value = await service.runInTransaction(async (tx) => {
      expect(tx).toEqual({ tx: 'proxy' });
      return result;
    });

    expect(value).toBe(result);
    expect(txSpy).toHaveBeenCalledTimes(1);
  });

  it('runInTransaction propagates callback errors', async () => {
    const service = new PrismaService(
      new AppConfigService(createConfigService()),
    );
    const boom = new Error('boom');
    vi.spyOn(service.client, '$transaction').mockImplementation(async (fn) => {
      return (fn as (tx: unknown) => Promise<unknown>)({ tx: 'proxy' });
    });

    await expect(
      service.runInTransaction(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
