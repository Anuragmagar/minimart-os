import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';
import { AppConfigModule } from '../../src/config/app-config.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PasswordService } from '../../src/auth/password.service.js';
import { JwtService } from '../../src/auth/jwt.service.js';
import { AuthService } from '../../src/auth/auth.service.js';

process.env.JWT_SECRET ??= 'auth-rotation-integration-test-secret-000000';

const PASSWORD = 'Rotation@Dev123';

let prisma: PrismaClientType;
let auth: AuthService;
let organizationId: string;
let userId: string;
let userEmail: string;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  await prisma.$connect();

  const org = await prisma.organization.create({
    data: {
      name: `Auth Rotation Org ${randomUUID()}`,
      legalName: 'Auth Rotation Pvt Ltd',
      currency: 'NPR',
    },
  });
  organizationId = org.id;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppConfigModule],
    providers: [
      PasswordService,
      JwtService,
      AuthService,
      // Point the service at the throwaway test database rather than DATABASE_URL.
      {
        provide: PrismaService,
        useValue: {
          client: prisma,
          runInTransaction: <T>(fn: (tx: never) => Promise<T>) =>
            prisma.$transaction(fn as never),
        },
      },
    ],
  }).compile();

  auth = moduleFixture.get(AuthService);
  const passwordService = moduleFixture.get(PasswordService);

  userEmail = `rotation-${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: {
      organizationId,
      name: 'Rotation User',
      email: userEmail,
      passwordHash: await passwordService.hash(PASSWORD),
    },
  });
  userId = user.id;
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

beforeEach(async () => {
  await prisma.refreshToken.deleteMany({});
});

async function login() {
  return auth.login({ email: userEmail, password: PASSWORD });
}

async function storedTokens() {
  return prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

describe('auth token storage', () => {
  it('stores only a hash of the issued refresh token', async () => {
    const response = await login();

    const rows = await storedTokens();
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(organizationId);
    expect(rows[0].revoked).toBe(false);
    expect(rows[0].tokenHash).not.toBe(response.refreshToken);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a wrong password without issuing any token', async () => {
    await expect(
      auth.login({ email: userEmail, password: 'Wrong@Password1' }),
    ).rejects.toThrow('Invalid credentials');
    expect(await storedTokens()).toHaveLength(0);
  });

  it('refuses to issue tokens for a deactivated account', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'inactive' },
    });
    try {
      await expect(login()).rejects.toThrow('Account is deactivated');
    } finally {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'active' },
      });
    }
  });
});

describe('refresh token rotation', () => {
  it('revokes the presented token and issues exactly one replacement', async () => {
    const session = await login();
    const refreshed = await auth.refresh(session.refreshToken);

    const rows = await storedTokens();
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked).toBe(true);
    expect(rows[1].revoked).toBe(false);
    expect(refreshed.refreshToken).not.toBe(session.refreshToken);
  });

  it('rejects a refresh token that has already been rotated', async () => {
    const session = await login();

    await auth.refresh(session.refreshToken);
    await expect(auth.refresh(session.refreshToken)).rejects.toThrow(
      'Invalid or expired refresh token',
    );

    // A replay must not mint a second session.
    expect(await storedTokens()).toHaveLength(2);
  });

  it('accepts only one of two concurrent refreshes of the same token', async () => {
    const session = await login();

    const results = await Promise.allSettled([
      auth.refresh(session.refreshToken),
      auth.refresh(session.refreshToken),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const rows = await storedTokens();
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => !r.revoked)).toHaveLength(1);
  });

  it('refuses to refresh after logout revoked the token', async () => {
    const session = await login();

    await auth.logout(session.refreshToken);
    await expect(auth.refresh(session.refreshToken)).rejects.toThrow(
      'Invalid or expired refresh token',
    );
  });

  it('refuses to refresh for a deactivated account', async () => {
    const session = await login();

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'inactive' },
    });
    try {
      await expect(auth.refresh(session.refreshToken)).rejects.toThrow(
        'User not found or deactivated',
      );
    } finally {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'active' },
      });
    }
  });
});
