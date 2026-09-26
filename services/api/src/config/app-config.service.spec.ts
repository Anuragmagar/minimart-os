import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from './configuration.js';
import { AppConfigService } from './app-config.service.js';

describe('AppConfigService', () => {
  it('exposes typed configuration values', () => {
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
    const configService = {
      getOrThrow: (key: string) => values[key as keyof AppConfig],
    } as ConfigService<AppConfig>;

    const service = new AppConfigService(configService);
    expect(service.nodeEnv).toBe('test');
    expect(service.port).toBe(4000);
    expect(service.host).toBe('0.0.0.0');
    expect(service.databaseUrl).toBe('postgres://u:p@db:5432/test');
    expect(service.redisUrl).toBe('redis://localhost:6379');
    expect(service.tz).toBe('Asia/Kathmandu');
    expect(service.apiPrefix).toBe('api');
    expect(service.apiVersion).toBe('v1');
    expect(service.logLevel).toBe('info');
    expect(service.bodyLimit).toBe('1mb');
    expect(service.argon2MemoryCost).toBe(19456);
    expect(service.argon2TimeCost).toBe(2);
    expect(service.argon2Parallelism).toBe(1);
    expect(service.accessTokenTtlSeconds).toBe(900);
    expect(service.refreshTokenTtlSeconds).toBe(604800);
    expect(service.idempotencyTtlSeconds).toBe(86400);
  });
});
