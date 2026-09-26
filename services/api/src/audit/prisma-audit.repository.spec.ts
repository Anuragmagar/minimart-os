import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma.service.js';
import { AuditRepository, type AuditLogParams } from './audit.repository.js';
import { PrismaAuditRepository } from './prisma-audit.repository.js';

function createRepository(prisma: PrismaService): AuditRepository {
  return new PrismaAuditRepository(prisma);
}

function createPrismaService(create: ReturnType<typeof vi.fn>): PrismaService {
  return {
    client: {
      auditLog: {
        create,
      },
    },
  } as unknown as PrismaService;
}

const ORG_ID = '11111111-1111-1111-1111-111111111111';

function entry(): AuditLogParams {
  return {
    organizationId: ORG_ID,
    action: 'create',
    entity: 'Product',
    entityId: 'PRD-1',
    before: { name: 'Old' },
    after: { name: 'New', password: 'plaintext' },
  };
}

describe('PrismaAuditRepository', () => {
  it('creates an audit log through the default client', async () => {
    const created = { id: 'audit-1', ...entry() };
    const create = vi.fn().mockResolvedValue(created);
    const prisma = createPrismaService(create);
    const repository = createRepository(prisma);

    const result = await repository.create(entry());

    expect(result).toEqual(created);
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG_ID,
        storeId: null,
        userId: null,
        deviceId: null,
        action: 'create',
        entity: 'Product',
        entityId: 'PRD-1',
        before: { name: 'Old' },
        after: { name: 'New', password: 'plaintext' },
      },
    });
  });

  it('maps omitted before/after to database null', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-2' });
    const prisma = createPrismaService(create);
    const repository = createRepository(prisma);

    await repository.create({
      organizationId: ORG_ID,
      action: 'delete',
      entity: 'Store',
      entityId: 'STR-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG_ID,
        storeId: null,
        userId: null,
        deviceId: null,
        action: 'delete',
        entity: 'Store',
        entityId: 'STR-1',
        before: Prisma.DbNull,
        after: Prisma.DbNull,
      },
    });
  });

  it('executes on the transaction client when a transaction is passed', async () => {
    const created = { id: 'audit-3' };
    const create = vi.fn().mockResolvedValue(created);
    const txCreate = vi.fn().mockResolvedValue(created);
    const prisma = createPrismaService(create);
    const repository = createRepository(prisma);
    const tx = {
      auditLog: { create: txCreate },
    } as unknown as Parameters<AuditRepository['create']>[1];

    const result = await repository.create(entry(), tx);

    expect(result).toEqual(created);
    expect(txCreate).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
