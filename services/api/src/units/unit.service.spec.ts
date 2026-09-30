import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { TenantContext } from '../../common/auth/authenticated-user.js';
import type { UnitRepository } from './unit.repository.js';
import { UnitService } from './unit.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const UNIT_ID = '33333333-3333-4333-8333-333333333333';
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
    findByCode?: ReturnType<typeof vi.fn>;
    findAllInOrganization?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
    record?: ReturnType<typeof vi.fn>;
    productCount?: ReturnType<typeof vi.fn>;
    conversionFromCount?: ReturnType<typeof vi.fn>;
    conversionToCount?: ReturnType<typeof vi.fn>;
    runInTransaction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const mocks = {
    findByIdInOrganization:
      overrides.findByIdInOrganization ?? vi.fn().mockResolvedValue(null),
    findByCode: overrides.findByCode ?? vi.fn().mockResolvedValue(null),
    findAllInOrganization:
      overrides.findAllInOrganization ??
      vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: overrides.create ?? vi.fn().mockResolvedValue({ id: UNIT_ID }),
    update: overrides.update ?? vi.fn().mockResolvedValue({ id: UNIT_ID }),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };

  const repository = mocks as unknown as UnitRepository;

  const audit = {
    record: overrides.record ?? vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;

  const tx = { unit: {} } as unknown as PrismaTx;
  const runInTransaction = overrides.runInTransaction ?? vi.fn();
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );

  const prisma = {
    client: {
      product: {
        count: overrides.productCount ?? vi.fn().mockResolvedValue(0),
      },
      unitConversion: {
        count: ({ where }: { where: { fromUnitId?: string } }) =>
          where.fromUnitId === undefined
            ? Promise.resolve(overrides.conversionToCount?.() ?? 0)
            : Promise.resolve(overrides.conversionFromCount?.() ?? 0),
      },
    },
    runInTransaction,
  } as unknown as PrismaService;

  return {
    service: new UnitService(repository, prisma, audit),
    repository,
    audit,
    prisma,
    runInTransaction,
    findAllInOrganization: mocks.findAllInOrganization,
    findByCode: mocks.findByCode,
    tx,
  };
}

describe('UnitService.create', () => {
  it('takes the organization from the principal, never from the payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: UNIT_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
      organizationId: OTHER_ORG_ID,
    } as never);

    expect(create.mock.calls[0][0]).toMatchObject({
      organizationId: ORG_ID,
      name: 'Kilogram',
      code: 'KG',
      precision: 3,
    });
    expect(create.mock.calls[0][0]).not.toMatchObject({
      organizationId: OTHER_ORG_ID,
    });
  });

  it('creates a unit as active', async () => {
    const create = vi.fn().mockResolvedValue({ id: UNIT_ID });
    const { service } = createService({ create });

    await service.create(ctx, { name: 'Piece', code: 'PCS', precision: 0 });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.anything(),
    );
  });

  it('rejects a duplicate code in the same organization', async () => {
    const { service } = createService({
      findByCode: vi.fn().mockResolvedValue({ id: UNIT_ID }),
    });

    await expect(
      service.create(ctx, { name: 'Kilo', code: 'KG', precision: 3 }),
    ).rejects.toThrow(ConflictException);
  });

  it('checks the code within the caller organization only', async () => {
    const findByCode = vi.fn().mockResolvedValue(null);
    const { service } = createService({ findByCode });

    await service.create(ctx, { name: 'Kilogram', code: 'KG', precision: 3 });

    expect(findByCode).toHaveBeenCalledWith('KG', ORG_ID, undefined);
  });

  it('allows a different organization to reuse the same code', async () => {
    // The repository scopes by organization, so a null result here is a pass.
    const findByCode = vi.fn().mockResolvedValue(null);
    const { service } = createService({ findByCode });

    await expect(
      service.create(ctx, { name: 'Kilogram', code: 'KG', precision: 3 }),
    ).resolves.toBeDefined();
    expect(findByCode).not.toHaveBeenCalledWith('KG', OTHER_ORG_ID, undefined);
  });

  it('writes an audit record in the same transaction as the create', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({ record });

    await service.create(ctx, { name: 'Piece', code: 'PCS', precision: 0 });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'unit.create',
        entity: 'Unit',
        entityId: UNIT_ID,
      }),
      tx,
    );
  });
});

describe('UnitService.findAll', () => {
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

describe('UnitService.update', () => {
  it('reports a missing or cross-organization unit as not found', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(ctx, UNIT_ID, { name: 'Renamed' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates only the supplied fields', async () => {
    const update = vi.fn().mockResolvedValue({ id: UNIT_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: UNIT_ID,
        code: 'KG',
      }),
      update,
    });

    await service.update(ctx, UNIT_ID, { name: 'Kilo' });

    expect(update.mock.calls[0][1]).toEqual({ name: 'Kilo' });
  });

  it('rejects a code change that collides with another unit', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: UNIT_ID,
        code: 'KG',
      }),
      findByCode: vi.fn().mockResolvedValue({ id: 'other-id' }),
    });

    await expect(service.update(ctx, UNIT_ID, { code: 'PCS' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows a unit to keep its own code on update', async () => {
    const update = vi.fn().mockResolvedValue({ id: UNIT_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: UNIT_ID,
        code: 'KG',
      }),
      findByCode: vi.fn().mockResolvedValue({ id: UNIT_ID }),
      update,
    });

    await service.update(ctx, UNIT_ID, { code: 'KG', name: 'Kilo' });

    expect(update).toHaveBeenCalled();
  });

  it('does not check the code when it is not being changed', async () => {
    const findByCode = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: UNIT_ID,
        code: 'KG',
      }),
      findByCode,
    });

    await service.update(ctx, UNIT_ID, { precision: 2 });

    expect(findByCode).not.toHaveBeenCalled();
  });

  it('allows a precision change', async () => {
    const update = vi.fn().mockResolvedValue({ id: UNIT_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: UNIT_ID,
        code: 'KG',
      }),
      update,
    });

    await service.update(ctx, UNIT_ID, { precision: 2 });

    expect(update.mock.calls[0][1]).toEqual({ precision: 2 });
  });

  it('records the before and after state', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: UNIT_ID,
        name: 'Kilogram',
        code: 'KG',
      }),
      update: vi.fn().mockResolvedValue({ id: UNIT_ID, name: 'Kilo' }),
      record,
    });

    await service.update(ctx, UNIT_ID, { name: 'Kilo' }, tx);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'unit.update',
        before: expect.objectContaining({ name: 'Kilogram' }),
        after: expect.objectContaining({ name: 'Kilo' }),
      }),
      tx,
    );
  });
});

describe('UnitService.deactivate', () => {
  it('sets the status to inactive and audits it', async () => {
    const update = vi
      .fn()
      .mockResolvedValue({ id: UNIT_ID, status: 'inactive' });
    const record = vi.fn().mockResolvedValue({});
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: UNIT_ID,
        status: 'active',
      }),
      update,
      record,
    });

    await service.deactivate(ctx, UNIT_ID);

    expect(update.mock.calls[0][1]).toEqual({ status: 'inactive' });
    expect(record.mock.calls[0][0]).toMatchObject({
      action: 'unit.deactivate',
    });
  });

  it('reports a missing unit as not found', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.deactivate(ctx, UNIT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('UnitService.delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses to delete a unit that products still reference', async () => {
    const remove = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: UNIT_ID }),
      productCount: vi.fn().mockResolvedValue(4),
      delete: remove,
    });

    await expect(service.delete(ctx, UNIT_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a unit that a conversion uses as the source', async () => {
    const remove = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: UNIT_ID }),
      conversionFromCount: vi.fn().mockReturnValue(1),
      delete: remove,
    });

    await expect(service.delete(ctx, UNIT_ID)).rejects.toThrow(
      /unit conversions/,
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a unit that a conversion uses as the target', async () => {
    const remove = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: UNIT_ID }),
      conversionToCount: vi.fn().mockReturnValue(1),
      delete: remove,
    });

    await expect(service.delete(ctx, UNIT_ID)).rejects.toThrow(
      /unit conversions/,
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes and audits an unreferenced unit', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: UNIT_ID }),
      delete: remove,
      record,
    });

    await service.delete(ctx, UNIT_ID);

    expect(remove).toHaveBeenCalledWith(UNIT_ID, tx);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unit.delete' }),
      tx,
    );
  });

  it('refuses to delete a unit in another organization', async () => {
    const remove = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
      delete: remove,
    });

    await expect(service.delete(ctx, UNIT_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
