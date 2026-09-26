import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../src/config/configuration.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import type { OrganizationRepository } from '../../src/organizations/organization.repository.js';
import { PrismaOrganizationRepository } from '../../src/organizations/prisma-organization.repository.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaService;
let repository: OrganizationRepository;

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
    idempotencyTtlSeconds: 86400,
  };
  const configService = {
    getOrThrow: (key: string) => values[key as keyof AppConfig],
  } as ConfigService<AppConfig>;
  prisma = new PrismaService(new AppConfigService(configService));
  await prisma.client.$connect();
  repository = new PrismaOrganizationRepository(prisma);
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.client.organization.deleteMany({});
  await prisma.onModuleDestroy();
});

describe('PrismaOrganizationRepository integration', () => {
  it('finds an organization by id through the repository', async () => {
    const org = await prisma.client.organization.create({
      data: {
        name: 'Repository Mart',
        legalName: 'Repository Mart Pvt Ltd',
        currency: 'NPR',
      },
    });

    const found = await repository.findById(org.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(org.id);
    expect(found?.name).toBe('Repository Mart');
    expect(found?.currency).toBe('NPR');
  });

  it('recognizes organization defaults through the repository', async () => {
    const org = await prisma.client.organization.create({
      data: {
        name: 'Defaults Mart',
        legalName: 'Defaults Pvt Ltd',
        currency: 'NPR',
      },
    });

    const found = await repository.findById(org.id);

    expect(found?.status).toBe('active');
    expect(found?.timezone).toBe('Asia/Kathmandu');
  });

  it('returns null for an unknown id', async () => {
    const found = await repository.findById(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(found).toBeNull();
  });
});
