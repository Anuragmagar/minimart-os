import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../database/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { CategoryRepository } from './category.repository.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { CategoryService } from './category.service.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const PARENT_ID = '55555555-5555-4555-8555-555555555555';

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
    findParentIdInOrganization?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
    record?: ReturnType<typeof vi.fn>;
    productCount?: ReturnType<typeof vi.fn>;
    categoryCount?: ReturnType<typeof vi.fn>;
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
    findParentIdInOrganization:
      overrides.findParentIdInOrganization ?? vi.fn().mockResolvedValue(null),
    create: overrides.create ?? vi.fn().mockResolvedValue({ id: CATEGORY_ID }),
    update: overrides.update ?? vi.fn().mockResolvedValue({ id: CATEGORY_ID }),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };

  const repository = mocks as unknown as CategoryRepository;

  const audit = {
    record: overrides.record ?? vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;

  const tx = { category: {} } as unknown as PrismaTx;
  const runInTransaction = overrides.runInTransaction ?? vi.fn();
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );

  const prisma = {
    client: {
      product: {
        count: overrides.productCount ?? vi.fn().mockResolvedValue(0),
      },
      category: {
        count: overrides.categoryCount ?? vi.fn().mockResolvedValue(0),
      },
    },
    runInTransaction,
  } as unknown as PrismaService;

  return {
    service: new CategoryService(repository, prisma, audit),
    repository,
    audit,
    prisma,
    runInTransaction,
    findAllInOrganization: mocks.findAllInOrganization,
    findByName: mocks.findByName,
  };
}

describe('CategoryService.create', () => {
  it('takes the organization from the principal, never from the payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: CATEGORY_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      name: 'Beverages',
      organizationId: OTHER_ORG_ID,
    } as never);

    expect(create.mock.calls[0][0]).toMatchObject({
      organizationId: ORG_ID,
      parentId: null,
      status: 'active',
    });
  });

  it('rejects a duplicate name inside the same organization', async () => {
    const { service } = createService({
      findByName: vi.fn().mockResolvedValue({ id: PARENT_ID }),
    });

    await expect(
      service.create(ctx, { name: 'Beverages' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a parent that belongs to another organization', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.create(ctx, { name: 'Juice', parentId: PARENT_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a parent that belongs to the same organization', async () => {
    const create = vi.fn().mockResolvedValue({ id: CATEGORY_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: PARENT_ID }),
      create,
    });

    await service.create(ctx, { name: 'Juice', parentId: PARENT_ID });

    expect(create.mock.calls[0][0]).toMatchObject({ parentId: PARENT_ID });
  });

  it('writes an audit record inside the same transaction as the insert', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, runInTransaction } = createService({ record });

    await service.create(ctx, { name: 'Beverages' });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'category.create',
        entity: 'Category',
        entityId: CATEGORY_ID,
      }),
      expect.anything(),
    );
    expect(runInTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('CategoryService.update', () => {
  it('rejects a name already used by a different category', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Beverages',
        parentId: null,
      }),
      findByName: vi.fn().mockResolvedValue({ id: PARENT_ID }),
    });

    await expect(
      service.update(ctx, CATEGORY_ID, { name: 'Snacks' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a category to keep its own name', async () => {
    const update = vi.fn().mockResolvedValue({ id: CATEGORY_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Beverages',
        parentId: null,
      }),
      findByName: vi.fn().mockResolvedValue({ id: CATEGORY_ID }),
      update,
    });

    await service.update(ctx, CATEGORY_ID, { name: 'Beverages' });

    expect(update).toHaveBeenCalled();
  });

  it('leaves the parent untouched when parentId is omitted', async () => {
    const update = vi.fn().mockResolvedValue({ id: CATEGORY_ID });
    const { service } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue({ id: CATEGORY_ID, name: 'Beverages' }),
      update,
    });

    await service.update(ctx, CATEGORY_ID, { status: 'inactive' });

    const data = update.mock.calls[0][1] as Record<string, unknown>;
    expect(data).not.toHaveProperty('parentId');
  });

  it('moves a category to the root when parentId is explicitly null', async () => {
    const update = vi.fn().mockResolvedValue({ id: CATEGORY_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Juice',
        parentId: PARENT_ID,
      }),
      update,
    });

    await service.update(ctx, CATEGORY_ID, { parentId: null });

    const data = update.mock.calls[0][1] as Record<string, unknown>;
    expect(data.parentId).toBeNull();
  });

  it('rejects a category being made its own parent', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Beverages',
        parentId: null,
      }),
    });

    await expect(
      service.update(ctx, CATEGORY_ID, { parentId: CATEGORY_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a parent chain that loops back to the category', async () => {
    // PARENT_ID -> grandparent, and the grandparent's parent is CATEGORY_ID, so
    // making PARENT_ID the parent of CATEGORY_ID closes the loop.
    const findParentIdInOrganization = vi
      .fn()
      .mockResolvedValueOnce(CATEGORY_ID)
      .mockResolvedValue(null);
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Beverages',
        parentId: null,
      }),
      findParentIdInOrganization,
    });

    await expect(
      service.update(ctx, CATEGORY_ID, { parentId: PARENT_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findParentIdInOrganization).toHaveBeenCalled();
  });

  it('accepts a parent chain that stays acyclic', async () => {
    const findParentIdInOrganization = vi.fn().mockResolvedValue(null);
    const update = vi.fn().mockResolvedValue({ id: CATEGORY_ID });
    const { service } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue({ id: CATEGORY_ID, name: 'Juice', parentId: null }),
      findParentIdInOrganization,
      update,
    });

    await service.update(ctx, CATEGORY_ID, { parentId: PARENT_ID });

    expect(update.mock.calls[0][1]).toMatchObject({ parentId: PARENT_ID });
  });

  it('terminates on pre-existing corrupt data instead of looping forever', async () => {
    // Two nodes pointing at each other, neither of which is the edited category.
    const findParentIdInOrganization = vi.fn().mockResolvedValue(CATEGORY_ID);
    const { service } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue({ id: CATEGORY_ID, name: 'Juice', parentId: null }),
      findParentIdInOrganization,
    });

    await expect(
      service.update(ctx, CATEGORY_ID, { parentId: PARENT_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findParentIdInOrganization.mock.calls.length).toBeLessThan(10);
  });

  it('reports a category from another organization as not found', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(ctx, CATEGORY_ID, { name: 'Snacks' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records before and after on update', async () => {
    const record = vi.fn().mockResolvedValue({});
    const before = { id: CATEGORY_ID, name: 'Beverages', status: 'active' };
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(before),
      record,
    });

    await service.update(ctx, CATEGORY_ID, { status: 'inactive' });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'category.update',
        before,
        after: expect.objectContaining({ id: CATEGORY_ID }),
      }),
      expect.anything(),
    );
  });
});

describe('CategoryService.deactivate', () => {
  it('sets the status to inactive and audits the change', async () => {
    const update = vi.fn().mockResolvedValue({ id: CATEGORY_ID });
    const record = vi.fn().mockResolvedValue({});
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: CATEGORY_ID }),
      update,
      record,
    });

    await service.deactivate(ctx, CATEGORY_ID);

    expect(update).toHaveBeenCalledWith(
      CATEGORY_ID,
      { status: 'inactive' },
      expect.anything(),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'category.deactivate' }),
      expect.anything(),
    );
  });

  it('reports an unknown category as not found', async () => {
    const { service } = createService();

    await expect(service.deactivate(ctx, CATEGORY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CategoryService.delete', () => {
  it('refuses to delete a category that still has products', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: CATEGORY_ID }),
      productCount: vi.fn().mockResolvedValue(3),
    });

    await expect(service.delete(ctx, CATEGORY_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses to delete a category that still has subcategories', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: CATEGORY_ID }),
      categoryCount: vi.fn().mockResolvedValue(2),
    });

    await expect(service.delete(ctx, CATEGORY_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes and audits an unreferenced category', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue({});
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: CATEGORY_ID }),
      delete: remove,
      record,
    });

    await service.delete(ctx, CATEGORY_ID);

    expect(remove).toHaveBeenCalledWith(CATEGORY_ID, expect.anything());
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'category.delete' }),
      expect.anything(),
    );
  });

  it('does not delete a category from another organization', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
      delete: remove,
    });

    await expect(service.delete(ctx, CATEGORY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('CategoryService reads', () => {
  it('scopes the list to the caller organization', async () => {
    const { service, findAllInOrganization } = createService();

    await service.findAll(ctx, {});

    expect(findAllInOrganization).toHaveBeenCalledWith({}, ORG_ID, undefined);
  });

  it('scopes a name lookup to the caller organization', async () => {
    const { service, findByName } = createService();

    await service.findByName(ctx, 'Beverages');

    expect(findByName).toHaveBeenCalledWith('Beverages', ORG_ID, undefined);
  });

  it('reports a missing category as not found', async () => {
    const { service } = createService();

    await expect(service.findById(ctx, CATEGORY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
