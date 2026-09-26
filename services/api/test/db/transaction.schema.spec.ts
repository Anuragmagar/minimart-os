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

describe('PrismaService transaction utility integration', () => {
  it('commits all writes inside a successful transaction', async () => {
    const created = await prisma.runInTransaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: 'Commit Mart',
          legalName: 'Commit Mart Pvt Ltd',
          currency: 'NPR',
        },
      });
      const other = await tx.organization.create({
        data: {
          name: 'Commit Twin',
          legalName: 'Commit Twin Pvt Ltd',
          currency: 'NPR',
        },
      });
      return { org, other };
    });

    const persisted = await prisma.client.organization.findUnique({
      where: { id: created.org.id },
    });
    expect(persisted?.name).toBe('Commit Mart');
    expect(
      await prisma.client.organization.findUnique({
        where: { id: created.other.id },
      }),
    ).not.toBeNull();
  });

  it('rolls back all writes when the callback throws', async () => {
    await expect(
      prisma.runInTransaction(async (tx) => {
        await tx.organization.create({
          data: {
            name: 'Rollback Mart',
            legalName: 'Rollback Mart Pvt Ltd',
            currency: 'NPR',
          },
        });
        await tx.organization.create({
          data: {
            name: 'Rollback Twin',
            legalName: 'Rollback Twin Pvt Ltd',
            currency: 'NPR',
          },
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const mart = await prisma.client.organization.findFirst({
      where: { name: 'Rollback Mart' },
    });
    expect(mart).toBeNull();
    const twin = await prisma.client.organization.findFirst({
      where: { name: 'Rollback Twin' },
    });
    expect(twin).toBeNull();
  });

  it('routes repository reads through the passed transaction', async () => {
    const insiderId = await prisma.runInTransaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: 'Tx Mart',
          legalName: 'Tx Mart Pvt Ltd',
          currency: 'NPR',
        },
      });

      const insideTx = await repository.findById(created.id, tx);
      expect(insideTx?.name).toBe('Tx Mart');

      const outsideTx = await repository.findById(created.id);
      expect(outsideTx).toBeNull();

      return created.id;
    });

    const afterCommit = await repository.findById(insiderId);
    expect(afterCommit?.name).toBe('Tx Mart');
  });
});
