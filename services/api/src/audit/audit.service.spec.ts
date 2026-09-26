import { describe, expect, it, vi } from 'vitest';
import type { PrismaTx } from '../database/prisma.service.js';
import { AuditRepository, type AuditLogParams } from './audit.repository.js';
import { AuditService } from './audit.service.js';

function createRepository(create: ReturnType<typeof vi.fn>): AuditRepository {
  return {
    create,
  } as unknown as AuditRepository;
}

function entry(): AuditLogParams {
  return {
    organizationId: '11111111-1111-1111-1111-111111111111',
    action: 'create',
    entity: 'Product',
    entityId: 'PRD-1',
    before: { price: 10 },
    after: { price: 12, apiKey: 'sekrit' },
  };
}

describe('AuditService', () => {
  it('delegates to the repository', async () => {
    const expected = { id: 'audit-1' };
    const create = vi.fn().mockResolvedValue(expected);
    const service = new AuditService(createRepository(create));

    const result = await service.record(entry());

    expect(result).toEqual(expected);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('sanitizes sensitive data in before/after before persisting', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-2' });
    const service = new AuditService(createRepository(create));

    await service.record(entry());

    const [persisted] = create.mock.calls[0];
    expect(persisted.before).toEqual({ price: 10 });
    expect(persisted.after).toEqual({ price: 12, apiKey: '[REDACTED]' });
  });

  it('passes the transaction through to the repository', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-3' });
    const service = new AuditService(createRepository(create));
    const tx = {} as PrismaTx;

    await service.record(entry(), tx);

    expect(create).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('keeps omitted before/after optional', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-4' });
    const service = new AuditService(createRepository(create));

    await service.record({
      organizationId: '11111111-1111-1111-1111-111111111111',
      action: 'delete',
      entity: 'Store',
      entityId: 'STR-1',
    });

    const [persisted] = create.mock.calls[0];
    expect(persisted.before).toBeUndefined();
    expect(persisted.after).toBeUndefined();
  });
});
