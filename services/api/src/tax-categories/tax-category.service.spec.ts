import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { TenantContext } from '../../common/auth/authenticated-user.js';
import type { TaxCategoryRepository } from './tax-category.repository.js';
import { TaxCategoryService } from './tax-category.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const TAX_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const ctx: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  storeId: null,
  permissions: ['products:manage'],
};

const FROM = '2005-01-14T00:00:00.000Z';
const TO = '2020-01-01T00:00:00.000Z';

/** A stored row as Prisma returns it: dates as Date, rate as a string here. */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: TAX_ID,
    organizationId: ORG_ID,
    name: 'VAT Standard Rate',
    code: 'VAT-STD',
    rate: '13.0000',
    taxType: 'VAT',
    effectiveFrom: new Date(FROM),
    effectiveTo: null,
    status: 'active',
    ...overrides,
  };
}

const validBody = {
  name: 'VAT Standard Rate',
  code: 'VAT-STD',
  rate: '13.0000',
  taxType: 'VAT',
  effectiveFrom: FROM,
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
    runInTransaction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const mocks = {
    findByIdInOrganization:
      overrides.findByIdInOrganization ?? vi.fn().mockResolvedValue(stored()),
    findByCode: overrides.findByCode ?? vi.fn().mockResolvedValue(null),
    findAllInOrganization:
      overrides.findAllInOrganization ??
      vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: overrides.create ?? vi.fn().mockResolvedValue(stored()),
    update: overrides.update ?? vi.fn().mockResolvedValue(stored()),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };

  const repository = mocks as unknown as TaxCategoryRepository;

  // One mock instance is shared with the returned handle, so a test that
  // asserts on `record` is asserting on the call the service actually made.
  const record = overrides.record ?? vi.fn().mockResolvedValue({});
  const audit = { record } as unknown as AuditService;

  const tx = { taxCategory: {} } as unknown as PrismaTx;
  const runInTransaction = overrides.runInTransaction ?? vi.fn();
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );

  const productCount = overrides.productCount ?? vi.fn().mockResolvedValue(0);
  const prisma = {
    client: { product: { count: productCount } },
    runInTransaction,
  } as unknown as PrismaService;

  return {
    service: new TaxCategoryService(repository, prisma, audit),
    repository,
    audit,
    prisma,
    runInTransaction,
    productCount,
    findByIdInOrganization: mocks.findByIdInOrganization,
    findByCode: mocks.findByCode,
    findAllInOrganization: mocks.findAllInOrganization,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
    record,
    tx,
  };
}

describe('TaxCategoryService.create', () => {
  it('takes the organization from the principal, never from the payload', async () => {
    const { service, create } = createService();

    await service.create(ctx, {
      ...validBody,
      organizationId: OTHER_ORG_ID,
    } as never);

    expect(create.mock.calls[0][0]).toMatchObject({ organizationId: ORG_ID });
    expect(create.mock.calls[0][0]).not.toMatchObject({
      organizationId: OTHER_ORG_ID,
    });
  });

  it('stores the rate as data and never derives one', async () => {
    const { service, create } = createService();

    await service.create(ctx, validBody);

    expect(create.mock.calls[0][0]).toMatchObject({
      rate: '13.0000',
      taxType: 'VAT',
    });
  });

  it('creates a tax category as active with no status in the payload', async () => {
    const { service, create } = createService();

    await service.create(ctx, { ...validBody, status: 'inactive' } as never);

    expect(create.mock.calls[0][0]).toMatchObject({ status: 'active' });
  });

  it('parses the effective window into dates and defaults the end to null', async () => {
    const { service, create } = createService();

    await service.create(ctx, validBody);

    const data = create.mock.calls[0][0] as {
      effectiveFrom: Date;
      effectiveTo: Date | null;
    };
    expect(data.effectiveFrom).toBeInstanceOf(Date);
    expect(data.effectiveFrom.toISOString()).toBe(FROM);
    expect(data.effectiveTo).toBeNull();
  });

  it('keeps a supplied effective end', async () => {
    const { service, create } = createService();

    await service.create(ctx, { ...validBody, effectiveTo: TO });

    expect(
      (
        create.mock.calls[0][0] as { effectiveTo: Date }
      ).effectiveTo.toISOString(),
    ).toBe(TO);
  });

  it('accepts a future effective start, because a rate may be configured before it applies', async () => {
    const { service, create } = createService();

    await service.create(ctx, {
      ...validBody,
      effectiveFrom: '2099-01-01T00:00:00.000Z',
    });

    expect(create).toHaveBeenCalled();
  });

  it('accepts a rate above 100, because no business cap was decided', async () => {
    const { service, create } = createService();

    await service.create(ctx, { ...validBody, rate: '250.0000' });

    expect(create.mock.calls[0][0]).toMatchObject({ rate: '250.0000' });
  });

  it('refuses a window whose end is not later than its start', async () => {
    for (const effectiveTo of [FROM, '2004-01-14T00:00:00.000Z']) {
      const { service, create } = createService();

      await expect(
        service.create(ctx, { ...validBody, effectiveTo }),
      ).rejects.toThrow('effectiveTo must be later than effectiveFrom');
      expect(create).not.toHaveBeenCalled();
    }
  });

  it('refuses a code already used in the same organization', async () => {
    const { service, create } = createService({
      findByCode: vi.fn().mockResolvedValue({ id: 'other-id' }),
    });

    await expect(service.create(ctx, validBody)).rejects.toThrow(
      'Tax category with this code already exists in organization',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('scopes the code check to the caller organization', async () => {
    const { service, findByCode } = createService();

    await service.create(ctx, validBody);

    expect(findByCode).toHaveBeenCalledWith('VAT-STD', ORG_ID, undefined);
  });

  it('audits the create in the same transaction as the insert', async () => {
    const { service, create, record, runInTransaction } = createService();

    await service.create(ctx, validBody);

    expect(create).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'tax_category.create',
        entity: 'TaxCategory',
        entityId: TAX_ID,
      }),
      expect.anything(),
    );
    expect(runInTransaction).toHaveBeenCalled();
  });
});

describe('TaxCategoryService.findById and findAll', () => {
  it('scopes the single read to the caller organization', async () => {
    const { service, findByIdInOrganization } = createService();

    await service.findById(ctx, TAX_ID);

    expect(findByIdInOrganization).toHaveBeenCalledWith(
      TAX_ID,
      ORG_ID,
      undefined,
    );
  });

  it('reports a foreign or unknown id as not found rather than forbidden', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.findById(ctx, TAX_ID)).rejects.toThrow(
      'Tax category not found',
    );
    await expect(service.findById(ctx, TAX_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('passes the query and the organization to the repository list', async () => {
    const { service, findAllInOrganization } = createService();

    await service.findAll(ctx, { search: 'vat', status: 'active' });

    expect(findAllInOrganization).toHaveBeenCalledWith(
      { search: 'vat', status: 'active' },
      ORG_ID,
      undefined,
    );
  });
});

describe('TaxCategoryService.update', () => {
  it('edits the rate in place rather than creating a new row', async () => {
    const { service, update, create } = createService();

    await service.update(ctx, TAX_ID, { rate: '15.0000' });

    expect(update).toHaveBeenCalledWith(
      TAX_ID,
      { rate: '15.0000' },
      expect.anything(),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('writes only the fields the payload carries', async () => {
    const { service, update } = createService();

    await service.update(ctx, TAX_ID, { name: 'VAT 15', taxType: 'VAT' });

    expect(update.mock.calls[0][1]).toEqual({
      name: 'VAT 15',
      taxType: 'VAT',
    });
  });

  it('allows the same code to be sent again without a conflict', async () => {
    const { service, findByCode, update } = createService({
      findByCode: vi.fn().mockResolvedValue({ id: TAX_ID }),
    });

    await service.update(ctx, TAX_ID, { code: 'VAT-STD' });

    // A row never conflicts with itself, so the duplicate check is skipped
    // entirely when the code is unchanged.
    expect(findByCode).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it('refuses a code another row in the organization already uses', async () => {
    const { service, update } = createService({
      findByCode: vi.fn().mockResolvedValue({ id: 'other-id' }),
    });

    await expect(
      service.update(ctx, TAX_ID, { code: 'VAT-RED' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('re-checks the window against the stored end when only the start moves', async () => {
    const { service, update } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue(
          stored({ effectiveFrom: new Date(FROM), effectiveTo: new Date(TO) }),
        ),
    });

    // Moving the start past the stored end would leave a window that never
    // opens, so the merged window is what gets validated.
    await expect(
      service.update(ctx, TAX_ID, {
        effectiveFrom: '2021-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('effectiveTo must be later than effectiveFrom');
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the end of the window when null is sent explicitly', async () => {
    const { service, update } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue(
          stored({ effectiveFrom: new Date(FROM), effectiveTo: new Date(TO) }),
        ),
    });

    await service.update(ctx, TAX_ID, { effectiveTo: null });

    expect(update.mock.calls[0][1]).toEqual({ effectiveTo: null });
  });

  it('leaves the stored end alone when the field is omitted', async () => {
    const { service, update } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue(
          stored({ effectiveFrom: new Date(FROM), effectiveTo: new Date(TO) }),
        ),
    });

    await service.update(ctx, TAX_ID, { rate: '15.0000' });

    expect(update.mock.calls[0][1]).toEqual({ rate: '15.0000' });
  });

  it('refuses an end that is not later than the start being set', async () => {
    const { service, update } = createService();

    await expect(
      service.update(ctx, TAX_ID, {
        effectiveFrom: '2010-01-01T00:00:00.000Z',
        effectiveTo: '2009-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an update to a category in another organization', async () => {
    const { service, update } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.update(ctx, TAX_ID, { rate: '1' })).rejects.toThrow(
      'Tax category not found',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('audits the before and after images', async () => {
    const after = stored({ rate: '15.0000' });
    const { service, record } = createService({
      update: vi.fn().mockResolvedValue(after),
      record: vi.fn().mockResolvedValue({}),
    });

    await service.update(ctx, TAX_ID, { rate: '15.0000' });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tax_category.update',
        entityId: TAX_ID,
        before: expect.objectContaining({ rate: '13.0000' }),
        after: expect.objectContaining({ rate: '15.0000' }),
      }),
      expect.anything(),
    );
  });
});

describe('TaxCategoryService.deactivate', () => {
  it('sets the status to inactive without touching anything else', async () => {
    const { service, update } = createService();

    await service.deactivate(ctx, TAX_ID);

    expect(update).toHaveBeenCalledWith(
      TAX_ID,
      { status: 'inactive' },
      expect.anything(),
    );
  });

  it('audits the deactivation', async () => {
    const { service, record } = createService({ record: vi.fn() });

    await service.deactivate(ctx, TAX_ID);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tax_category.deactivate' }),
      expect.anything(),
    );
  });

  it('reports a foreign id as not found', async () => {
    const { service, update } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.deactivate(ctx, TAX_ID)).rejects.toThrow(
      'Tax category not found',
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('TaxCategoryService.delete', () => {
  it('deletes a category no product references', async () => {
    const {
      service,
      delete: remove,
      record,
    } = createService({
      record: vi.fn(),
    });

    await service.delete(ctx, TAX_ID);

    expect(remove).toHaveBeenCalledWith(TAX_ID, expect.anything());
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tax_category.delete',
        before: expect.objectContaining({ id: TAX_ID }),
      }),
      expect.anything(),
    );
  });

  it('refuses to delete a category products still reference', async () => {
    const { service, delete: remove } = createService({
      productCount: vi.fn().mockResolvedValue(2),
    });

    await expect(service.delete(ctx, TAX_ID)).rejects.toThrow(
      'Tax category is still referenced by products; deactivate it instead',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('counts products through the ambient transaction when one is given', async () => {
    const countTx = vi.fn().mockResolvedValue(0);
    const { service, tx } = createService();
    (
      tx as unknown as { product: { count: ReturnType<typeof vi.fn> } }
    ).product = {
      count: countTx,
    };

    await service.delete(ctx, TAX_ID, tx);

    expect(countTx).toHaveBeenCalledWith({ where: { taxCategoryId: TAX_ID } });
  });

  it('reports a foreign id as not found before counting anything', async () => {
    const {
      service,
      productCount,
      delete: remove,
    } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.delete(ctx, TAX_ID)).rejects.toThrow(
      'Tax category not found',
    );
    expect(productCount).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
