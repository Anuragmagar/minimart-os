import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

let orgCounter = 0;

async function createOrg() {
  orgCounter += 1;
  const name = `Refresh Token Org ${randomUUID()}-${orgCounter}`;
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createUser(organizationId: string) {
  return prisma.user.create({
    data: { organizationId, name: 'Token User', passwordHash: 'argon2hash' },
  });
}

async function createRefreshToken(userId: string, organizationId: string) {
  return prisma.refreshToken.create({
    data: {
      userId,
      organizationId,
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
}

describe('RefreshToken schema', () => {
  it('stores only a token hash with documented defaults', async () => {
    const org = await createOrg();
    const user = await createUser(org.id);
    const token = await createRefreshToken(user.id, org.id);

    expect(token.userId).toBe(user.id);
    expect(token.organizationId).toBe(org.id);
    expect(token.revoked).toBe(false);
    expect(token.expiresAt).toBeInstanceOf(Date);
  });

  it('enforces a globally unique token hash', async () => {
    const org = await createOrg();
    const user = await createUser(org.id);
    const tokenHash = `hash-${randomUUID()}`;

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await expect(
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a token referencing a non-existent user', async () => {
    const org = await createOrg();

    await expect(
      prisma.refreshToken.create({
        data: {
          userId: randomUUID(),
          organizationId: org.id,
          tokenHash: `hash-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a token referencing a non-existent organization', async () => {
    const org = await createOrg();
    const user = await createUser(org.id);

    await expect(
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          organizationId: randomUUID(),
          tokenHash: `hash-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting a user that still has refresh tokens', async () => {
    const org = await createOrg();
    const user = await createUser(org.id);
    await createRefreshToken(user.id, org.id);

    await expect(
      prisma.user.delete({ where: { id: user.id } }),
    ).rejects.toThrow();
  });

  it('blocks deleting an organization that still has refresh tokens', async () => {
    const org = await createOrg();
    const user = await createUser(org.id);
    await createRefreshToken(user.id, org.id);

    await expect(
      prisma.organization.delete({ where: { id: org.id } }),
    ).rejects.toThrow();
  });
});

describe('RefreshToken foreign keys', () => {
  it('declares both tenant foreign keys with ON DELETE RESTRICT', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname = 'refresh_tokens'
       ORDER BY a.attname`,
    )) as Array<{ column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      { column_name: 'organization_id', on_delete: 'r' },
      { column_name: 'user_id', on_delete: 'r' },
    ]);
  });

  it('keeps exactly one index per foreign key column', async () => {
    // Asserted for both tenant columns, not just user_id: the base migration
    // already creates these indexes, so a foreign key migration that re-created
    // them would produce silent duplicates. A duplicate index is invisible to
    // every functional test, so the exact index name set is the only guard.
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'refresh_tokens'
         AND (indexdef LIKE '%(user_id)%' OR indexdef LIKE '%(organization_id)%')
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'refresh_tokens_organization_id_idx' },
      { indexname: 'refresh_tokens_user_id_idx' },
    ]);
  });
});
