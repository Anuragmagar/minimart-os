import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { TenantContext } from '../../common/auth/authenticated-user.js';
import type { BrandRepository } from './brand.repository.js';
import { BrandService } from './brand.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const BRAND_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const ctx: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  storeId: null,
  permissions: ['products:manage'],
};

function createService(
  overrides: {
    findByIdInOrganization?: ReturnType<typeof vi.fn>;
    findByName?: ReturnType<typeof vi.fn>;
    findAllInOrganization?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
    record?: ReturnType<typeof vi.fn>;
    productCount?: ReturnType<typeof vi.fn>;
    runInTransaction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const mocks = {
    findByIdInOrganization:
      overrides.findByIdInOrganization ?? vi.fn().mockResolvedValue(null),
    findByName: overrides.findByName ?? vi.fn().mockResolvedValue(null),
    findAllInOrganization:
      overrides.findAllInOrganization ??
      vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: overrides.create ?? vi.fn().mockResolvedValue({ id: BRAND_ID }),
    update: overrides.update ?? vi.fn().mockResolvedValue({ id: BRAND_ID }),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };

  const repository = mocks as unknown as BrandRepository;

  const audit = {
    record: overrides.record ?? vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;

  const tx = { brand: {} } as unknown as PrismaTx;
  const runInTransaction = overrides.runInTransaction ?? vi.fn();
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );

  const prisma = {
    client: {
      product: {
        count: overrides.productCount ?? vi.fn().mockResolvedValue(0),
      },
    },
    runInTransaction,
  } as unknown as PrismaService;

  return {
    service: new BrandService(repository, prisma, audit),
    repository,
    audit,
    prisma,
    runInTransaction,
    findAllInOrganization: mocks.findAllInOrganization,
    findByName: mocks.findByName,
    tx,
  };
}

describe('BrandService.create', () => {
  it('takes the organization from the principal, never from the payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: BRAND_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      name: 'Everest Foods',
      organizationId: OTHER_ORG_ID,
    } as never);

    expect(create.mock.calls[0][0]).toMatchObject({
      organizationId: ORG_ID,
      name: 'Everest Foods',
    });
    expect(create.mock.calls[0][0]).not.toMatchObject({
      organizationId: OTHER_ORG_ID,
    });
  });

  it('creates a brand as active', async () => {
    const create = vi.fn().mockResolvedValue({ id: BRAND_ID });
    const { service } = createService({ create });

    await service.create(ctx, { name: 'Everest Foods' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.anything(),
    );
  });

  it('rejects a duplicate name inside the same organization', async () => {
    const { service } = createService({
      findByName: vi.fn().mockResolvedValue({ id: BRAND_ID }),
    });

    await expect(
      service.create(ctx, { name: 'Everest Foods' }),
    ).rejects.toThrow(ConflictException);
  });

  it('checks for a duplicate within the caller organization only', async () => {
    const findByName = vi.fn().mockResolvedValue(null);
    const { service } = createService({ findByName });

    await service.create(ctx, { name: 'Everest Foods' });

    expect(findByName).toHaveBeenCalledWith('Everest Foods', ORG_ID, undefined);
  });

  it('writes an audit record in the same transaction as the create', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({ record });

    await service.create(ctx, { name: 'Everest Foods' });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'brand.create',
        entity: 'Brand',
        entityId: BRAND_ID,
      }),
      tx,
    );
  });

  it('opens a transaction when no outer one is supplied', async () => {
    const { service, runInTransaction } = createService();

    await service.create(ctx, { name: 'Everest Foods' });

    expect(runInTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('BrandService.findAll', () => {
  it('scopes the list to the caller organization', async () => {
    const { service, findAllInOrganization } = createService();

    await service.findAll(ctx, { page: 1, limit: 20 });

    expect(findAllInOrganization).toHaveBeenCalledWith(
      expect.anything(),
      ORG_ID,
      undefined,
    );
  });
});

describe('BrandService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports a missing or cross-organization brand as not found', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(ctx, BRAND_ID, { name: 'Renamed' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates only the supplied fields', async () => {
    const update = vi.fn().mockResolvedValue({ id: BRAND_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: BRAND_ID,
        name: 'Everest Foods',
      }),
      findByName: vi.fn().mockResolvedValue(null),
      update,
    });

    await service.update(ctx, BRAND_ID, { name: 'Everest Group' });

    expect(update.mock.calls[0][1]).toEqual({ name: 'Everest Group' });
  });

  it('rejects a rename that collides with another brand', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: BRAND_ID,
        name: 'Everest Foods',
      }),
      findByName: vi.fn().mockResolvedValue({ id: 'other-id' }),
    });

    await expect(
      service.update(ctx, BRAND_ID, { name: 'City Fresh' }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows a brand to keep its own name on update', async () => {
    const update = vi.fn().mockResolvedValue({ id: BRAND_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: BRAND_ID,
        name: 'Everest Foods',
      }),
      findByName: vi.fn().mockResolvedValue({ id: BRAND_ID }),
      update,
    });

    await service.update(ctx, BRAND_ID, { name: 'Everest Foods' });

    expect(update).toHaveBeenCalled();
  });

  it('records the before and after state', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: BRAND_ID,
        name: 'Everest Foods',
      }),
      findByName: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({
        id: BRAND_ID,
        name: 'Everest Group',
      }),
      record,
    });

    await service.update(ctx, BRAND_ID, { name: 'Everest Group' }, tx);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'brand.update',
        before: expect.objectContaining({ name: 'Everest Foods' }),
        after: expect.objectContaining({ name: 'Everest Group' }),
      }),
      tx,
    );
  });
});

describe('BrandService.deactivate', () => {
  it('sets the status to inactive and audits it', async () => {
    const update = vi
      .fn()
      .mockResolvedValue({ id: BRAND_ID, status: 'inactive' });
    const record = vi.fn().mockResolvedValue({});
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: BRAND_ID,
        status: 'active',
      }),
      update,
      record,
    });

    await service.deactivate(ctx, BRAND_ID);

    expect(update.mock.calls[0][1]).toEqual({ status: 'inactive' });
    expect(record.mock.calls[0][0]).toMatchObject({
      action: 'brand.deactivate',
    });
  });

  it('reports a missing brand as not found', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.deactivate(ctx, BRAND_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('BrandService.delete', () => {
  it('refuses to delete a brand that products still reference', async () => {
    const remove = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: BRAND_ID }),
      productCount: vi.fn().mockResolvedValue(3),
      delete: remove,
    });

    await expect(service.delete(ctx, BRAND_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes and audits an unreferenced brand', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: BRAND_ID }),
      productCount: vi.fn().mockResolvedValue(0),
      delete: remove,
      record,
    });

    await service.delete(ctx, BRAND_ID);

    expect(remove).toHaveBeenCalledWith(BRAND_ID, tx);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'brand.delete' }),
      tx,
    );
  });

  it('refuses to delete a brand in another organization', async () => {
    const remove = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
      delete: remove,
    });

    await expect(service.delete(ctx, BRAND_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
