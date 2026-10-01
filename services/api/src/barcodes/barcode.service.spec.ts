import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../database/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import type { BarcodeRepository } from './barcode.repository.js';
import type { ProductRepository } from '../products/product.repository.js';
import { BarcodeService } from './barcode.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PRODUCT_ID = '99999999-9999-4999-8999-999999999999';
const BARCODE_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_BARCODE_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const ctx: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  storeId: null,
  permissions: ['products:manage'],
};

const storedBarcode = {
  id: BARCODE_ID,
  organizationId: ORG_ID,
  productId: PRODUCT_ID,
  barcode: '5000112637922',
  barcodeType: 'EAN13',
  isPrimary: true,
};

function createService(
  overrides: {
    findByIdInProduct?: ReturnType<typeof vi.fn>;
    findByValue?: ReturnType<typeof vi.fn>;
    findAllForProduct?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
    demotePrimary?: ReturnType<typeof vi.fn>;
    findProduct?: ReturnType<typeof vi.fn>;
    record?: ReturnType<typeof vi.fn>;
    runInTransaction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const mocks = {
    findByIdInProduct:
      overrides.findByIdInProduct ?? vi.fn().mockResolvedValue(storedBarcode),
    findByValue: overrides.findByValue ?? vi.fn().mockResolvedValue(null),
    findAllForProduct:
      overrides.findAllForProduct ?? vi.fn().mockResolvedValue([storedBarcode]),
    create: overrides.create ?? vi.fn().mockResolvedValue(storedBarcode),
    update: overrides.update ?? vi.fn().mockResolvedValue(storedBarcode),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
    demotePrimary:
      overrides.demotePrimary ?? vi.fn().mockResolvedValue(undefined),
  };
  const barcodeRepository = mocks as unknown as BarcodeRepository;

  const findProduct =
    overrides.findProduct ??
    vi.fn().mockResolvedValue({ id: PRODUCT_ID, sku: 'COK-500' });
  const productRepository = {
    findByIdInOrganization: findProduct,
  } as unknown as ProductRepository;

  const audit = {
    record: overrides.record ?? vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;

  const prisma = {
    client: {},
    runInTransaction: overrides.runInTransaction ?? vi.fn(),
  } as unknown as PrismaService;

  const runInTransaction = (
    prisma as unknown as { runInTransaction: ReturnType<typeof vi.fn> }
  ).runInTransaction;
  // The default transaction body hands the callback a stand-in client, so a
  // test that omits an ambient transaction still exercises the write path
  // without a database.
  const tx = {} as unknown as PrismaTx;
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );

  return {
    service: new BarcodeService(
      barcodeRepository,
      productRepository,
      prisma,
      audit,
    ),
    audit,
    prisma,
    runInTransaction,
    tx,
    findProduct,
    findByIdInProduct: mocks.findByIdInProduct,
    findByValue: mocks.findByValue,
    findAllForProduct: mocks.findAllForProduct,
    create: mocks.create,
    update: mocks.update,
    remove: mocks.delete,
    demotePrimary: mocks.demotePrimary,
  };
}

describe('BarcodeService reads', () => {
  it('resolves the parent product in the caller organization before the barcode', async () => {
    const { service, findProduct, findByIdInProduct } = createService();

    await service.findById(ctx, PRODUCT_ID, BARCODE_ID);

    expect(findProduct).toHaveBeenCalledWith(PRODUCT_ID, ORG_ID, undefined);
    expect(findByIdInProduct).toHaveBeenCalledWith(
      BARCODE_ID,
      PRODUCT_ID,
      ORG_ID,
      undefined,
    );
  });

  it('reports a product in another organization as not found', async () => {
    const { service, findByIdInProduct } = createService({
      findProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(service.findById(ctx, PRODUCT_ID, BARCODE_ID)).rejects.toThrow(
      'Product not found',
    );
    // The barcode is never addressed, so a product outside the tenant cannot be
    // probed for which barcode ids it holds.
    expect(findByIdInProduct).not.toHaveBeenCalled();
  });

  it('reports a missing barcode as not found', async () => {
    const { service } = createService({
      findByIdInProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(service.findById(ctx, PRODUCT_ID, BARCODE_ID)).rejects.toThrow(
      'Barcode not found',
    );
    await expect(
      service.findById(ctx, PRODUCT_ID, BARCODE_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes the collection to the parent product and the organization', async () => {
    const { service, findAllForProduct } = createService();

    await service.findAll(ctx, PRODUCT_ID);

    expect(findAllForProduct).toHaveBeenCalledWith(
      PRODUCT_ID,
      ORG_ID,
      undefined,
    );
  });

  it('refuses to list barcodes of a product outside the organization', async () => {
    const { service, findAllForProduct } = createService({
      findProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(service.findAll(ctx, OTHER_PRODUCT_ID)).rejects.toThrow(
      'Product not found',
    );
    expect(findAllForProduct).not.toHaveBeenCalled();
  });
});

describe('BarcodeService.create', () => {
  it('takes the organization from the principal, never from the payload', async () => {
    const { service, create } = createService();

    await service.create(ctx, PRODUCT_ID, {
      barcode: '5000112637922',
      organizationId: OTHER_ORG_ID,
      productId: OTHER_PRODUCT_ID,
    } as never);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        productId: PRODUCT_ID,
      }),
      expect.anything(),
    );
  });

  it('rejects a value already used by another product of the same organization', async () => {
    const { service, findByValue } = createService({
      findByValue: vi
        .fn()
        .mockResolvedValue({ ...storedBarcode, productId: OTHER_PRODUCT_ID }),
    });

    await expect(
      service.create(ctx, PRODUCT_ID, { barcode: '5000112637922' }),
    ).rejects.toThrow(ConflictException);
    // Uniqueness is organization-wide, so the conflicting row is located without
    // naming the product that holds it.
    expect(findByValue).toHaveBeenCalledWith(
      '5000112637922',
      ORG_ID,
      undefined,
    );
  });

  it('allows the same value in a different organization', async () => {
    const { service, findByValue, create } = createService();

    await service.create(ctx, PRODUCT_ID, { barcode: '5000112637922' });

    // The only lookup is the caller's own organization, so a value held by
    // another tenant is never seen and never conflicts.
    expect(findByValue).toHaveBeenCalledWith(
      '5000112637922',
      ORG_ID,
      undefined,
    );
    expect(create).toHaveBeenCalled();
  });

  it('defaults an absent type to null and an absent primary flag to false', async () => {
    const { service, create } = createService();

    await service.create(ctx, PRODUCT_ID, { barcode: 'COLD-DRINK-500ML' });

    expect(create).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        productId: PRODUCT_ID,
        barcode: 'COLD-DRINK-500ML',
        barcodeType: null,
        isPrimary: false,
      },
      expect.anything(),
    );
  });

  it('demotes the previous primary before promoting a new one', async () => {
    const order: string[] = [];
    const { service, demotePrimary } = createService({
      demotePrimary: vi.fn().mockImplementation(() => {
        order.push('demote');
        return Promise.resolve();
      }),
      create: vi.fn().mockImplementation(() => {
        order.push('create');
        return Promise.resolve(storedBarcode);
      }),
    });

    await service.create(ctx, PRODUCT_ID, {
      barcode: '5000112637922',
      isPrimary: true,
    });

    // The demotion must land before the insert, otherwise the product would hold
    // two primary barcodes for the length of the transaction.
    expect(order).toEqual(['demote', 'create']);
    expect(demotePrimary).toHaveBeenCalledWith(
      PRODUCT_ID,
      ORG_ID,
      expect.anything(),
    );
  });

  it('does not demote when the new barcode is not primary', async () => {
    const { service, demotePrimary } = createService();

    await service.create(ctx, PRODUCT_ID, {
      barcode: '5000112637922',
      isPrimary: false,
    });

    expect(demotePrimary).not.toHaveBeenCalled();
  });

  it('audits the created row against the caller', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service } = createService({ record });

    await service.create(ctx, PRODUCT_ID, {
      barcode: '5000112637922',
      isPrimary: true,
    });

    expect(record).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'product_barcode.create',
        entity: 'ProductBarcode',
        entityId: BARCODE_ID,
        after: storedBarcode,
      },
      expect.anything(),
    );
  });

  it('refuses to create against a product outside the organization', async () => {
    const { service, create } = createService({
      findProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.create(ctx, OTHER_PRODUCT_ID, { barcode: '5000112637922' }),
    ).rejects.toThrow('Product not found');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('BarcodeService.update', () => {
  it('writes nothing when no updatable field is present', async () => {
    const { service, update, runInTransaction } = createService();

    const result = await service.update(ctx, PRODUCT_ID, BARCODE_ID, {});

    expect(result).toEqual(storedBarcode);
    expect(update).not.toHaveBeenCalled();
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('changes only the fields that are present', async () => {
    const { service, update, demotePrimary } = createService();

    await service.update(ctx, PRODUCT_ID, BARCODE_ID, { barcodeType: 'UPC' });

    expect(update).toHaveBeenCalledWith(
      BARCODE_ID,
      { barcodeType: 'UPC' },
      expect.anything(),
    );
    expect(demotePrimary).not.toHaveBeenCalled();
  });

  it('clears the type when an explicit null is sent', async () => {
    const { service, update } = createService();

    await service.update(ctx, PRODUCT_ID, BARCODE_ID, { barcodeType: null });

    // `null` is written, not skipped: the key is present in the payload, which is
    // what distinguishes clearing from omitting.
    expect(update).toHaveBeenCalledWith(
      BARCODE_ID,
      { barcodeType: null },
      expect.anything(),
    );
  });

  it('promotes in the same transaction that demotes the previous primary', async () => {
    const order: string[] = [];
    const { service, demotePrimary, tx } = createService({
      demotePrimary: vi.fn().mockImplementation(() => {
        order.push('demote');
        return Promise.resolve();
      }),
      update: vi.fn().mockImplementation(() => {
        order.push('update');
        return Promise.resolve(storedBarcode);
      }),
    });

    await service.update(ctx, PRODUCT_ID, BARCODE_ID, { isPrimary: true });

    expect(order).toEqual(['demote', 'update']);
    expect(demotePrimary).toHaveBeenCalledWith(PRODUCT_ID, ORG_ID, tx);
  });

  it('gives up primary status without demoting anything', async () => {
    const { service, update, demotePrimary } = createService();

    await service.update(ctx, PRODUCT_ID, BARCODE_ID, { isPrimary: false });

    expect(demotePrimary).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      BARCODE_ID,
      { isPrimary: false },
      expect.anything(),
    );
  });

  it('audits the row before and after the change', async () => {
    const updated = { ...storedBarcode, isPrimary: false };
    const record = vi.fn().mockResolvedValue({});
    const { service } = createService({
      record,
      update: vi.fn().mockResolvedValue(updated),
    });

    await service.update(ctx, PRODUCT_ID, BARCODE_ID, { isPrimary: false });

    expect(record).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'product_barcode.update',
        entity: 'ProductBarcode',
        entityId: BARCODE_ID,
        before: storedBarcode,
        after: updated,
      },
      expect.anything(),
    );
  });

  it('refuses to update a barcode that is not in the caller organization', async () => {
    const { service, update } = createService({
      findByIdInProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(ctx, PRODUCT_ID, OTHER_BARCODE_ID, { isPrimary: true }),
    ).rejects.toThrow('Barcode not found');
    expect(update).not.toHaveBeenCalled();
  });

  it('cannot reach a sibling product barcode through a product that does exist', async () => {
    const { service, findByIdInProduct, update } = createService({
      findByIdInProduct: vi.fn().mockResolvedValue(null),
    });

    // The parent resolves, because the sibling product is a real product of this
    // organization. The barcode lookup is keyed on the product as well as the
    // organization, so the row is not found and nothing is written.
    await expect(
      service.update(ctx, OTHER_PRODUCT_ID, BARCODE_ID, { isPrimary: true }),
    ).rejects.toThrow('Barcode not found');
    expect(findByIdInProduct).toHaveBeenCalledWith(
      BARCODE_ID,
      OTHER_PRODUCT_ID,
      ORG_ID,
      undefined,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('BarcodeService.delete', () => {
  it('removes the row and audits what was removed', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, remove } = createService({ record });

    await service.delete(ctx, PRODUCT_ID, BARCODE_ID);

    expect(remove).toHaveBeenCalledWith(BARCODE_ID, expect.anything());
    expect(record).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'product_barcode.delete',
        entity: 'ProductBarcode',
        entityId: BARCODE_ID,
        before: storedBarcode,
      },
      expect.anything(),
    );
  });

  it('removes the primary barcode without promoting another one', async () => {
    const { service, demotePrimary, update } = createService();

    await service.delete(ctx, PRODUCT_ID, BARCODE_ID);

    // No automatic promotion: nothing documents which remaining barcode would be
    // the right successor, so the product is left with none and the operator
    // chooses.
    expect(demotePrimary).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses to delete a barcode outside the organization', async () => {
    const { service, remove } = createService({
      findByIdInProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(service.delete(ctx, PRODUCT_ID, BARCODE_ID)).rejects.toThrow(
      'Barcode not found',
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('BarcodeService transaction handling', () => {
  it('joins an ambient transaction instead of opening its own', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, runInTransaction, create, tx } = createService({ record });

    await service.create(ctx, PRODUCT_ID, { barcode: '5000112637922' }, tx);

    expect(runInTransaction).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.anything(), tx);
    // The audit shares the caller's transaction, so the barcode and the record
    // of it commit or roll back together.
    expect(record).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('opens its own transaction when none is supplied', async () => {
    const { service, runInTransaction, create } = createService();

    await service.create(ctx, PRODUCT_ID, { barcode: '5000112637922' });

    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.anything());
  });
});
