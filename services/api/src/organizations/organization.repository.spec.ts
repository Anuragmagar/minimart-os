import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { OrganizationRepository } from './organization.repository.js';
import { PrismaOrganizationRepository } from './prisma-organization.repository.js';

function createRepository(prisma: PrismaService): OrganizationRepository {
  return new PrismaOrganizationRepository(prisma);
}

function createPrismaService(
  findUnique: ReturnType<typeof vi.fn>,
): PrismaService {
  return {
    client: {
      organization: {
        findUnique,
      },
    },
  } as unknown as PrismaService;
}

describe('PrismaOrganizationRepository', () => {
  it('returns the organization for an existing id', async () => {
    const expected = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Kathmandu Mart',
      currency: 'NPR',
    };
    const findUnique = vi.fn().mockResolvedValue(expected);
    const prisma = createPrismaService(findUnique);
    const repository = createRepository(prisma);

    const result = await repository.findById(expected.id);

    expect(result).toEqual(expected);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: expected.id },
    });
  });

  it('returns null for an unknown id', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = createPrismaService(findUnique);
    const repository = createRepository(prisma);

    const result = await repository.findById(
      '22222222-2222-2222-2222-222222222222',
    );

    expect(result).toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: '22222222-2222-2222-2222-222222222222' },
    });
  });

  it('executes on the transaction client when a transaction is passed', async () => {
    const id = '33333333-3333-3333-3333-333333333333';
    const expected = { id, name: 'Tx Mart', currency: 'NPR' };
    const findUnique = vi.fn().mockResolvedValue(expected);
    const txFindUnique = vi.fn().mockResolvedValue(expected);
    const prisma = createPrismaService(findUnique);
    const repository = createRepository(prisma);
    const tx = {
      organization: { findUnique: txFindUnique },
    } as unknown as Parameters<OrganizationRepository['findById']>[1];

    const result = await repository.findById(id, tx);

    expect(result).toEqual(expected);
    expect(txFindUnique).toHaveBeenCalledWith({
      where: { id },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
