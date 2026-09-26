import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/configuration.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PasswordService } from './password.service.js';

function createService(overrides?: Partial<AppConfig>): PasswordService {
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
    ...overrides,
  };
  const configService = {
    getOrThrow: (key: string) => values[key as keyof AppConfig],
  } as ConfigService<AppConfig>;
  return new PasswordService(new AppConfigService(configService));
}

describe('PasswordService', () => {
  it('hashes a password with Argon2id encoding', async () => {
    const service = createService();
    const encoded = await service.hash('correct horse battery staple');
    expect(encoded.startsWith('$argon2id$v=19$')).toBe(true);
  });

  it('produces distinct hashes for the same password', async () => {
    const service = createService();
    const first = await service.hash('same-password');
    const second = await service.hash('same-password');
    expect(first).not.toBe(second);
  });

  it('verifies a correct password', async () => {
    const service = createService();
    const encoded = await service.hash('MinimartDev@123');
    await expect(service.verify('MinimartDev@123', encoded)).resolves.toBe(
      true,
    );
  });

  it('rejects a wrong password', async () => {
    const service = createService();
    const encoded = await service.hash('MinimartDev@123');
    await expect(service.verify('wrong-password', encoded)).resolves.toBe(
      false,
    );
  });

  it('honors configured argon2 parameters', async () => {
    const service = createService({
      argon2MemoryCost: 32768,
      argon2TimeCost: 3,
      argon2Parallelism: 2,
    });
    const encoded = await service.hash('param-check');
    expect(encoded.startsWith('$argon2id$')).toBe(true);
    expect(encoded).toContain('m=32768');
    expect(encoded).toContain('t=3');
    expect(encoded).toContain('p=2');
    await expect(service.verify('param-check', encoded)).resolves.toBe(true);
  });
});
