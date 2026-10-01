import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { TenantContext } from '../../common/auth/authenticated-user.js';
import type { ProductRepository } from './product.repository.js';
import type { CategoryRepository } from '../../categories/category.repository.js';
import type { BrandRepository } from '../../brands/brand.repository.js';
import type { UnitRepository } from '../../units/unit.repository.js';
import { ProductService } from './product.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const BRAND_ID = '66666666-6666-4666-8666-666666666666';
const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const TAX_CATEGORY_ID = '88888888-8888-4888-8888-888888888888';

const ctx: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  storeId: null,
  permissions: ['products:manage'],
};

/**
 * Counts for the nine RESTRICT child tables that block a product delete. Each
 * defaults to zero so a test only states the history it cares about.
 */
type HistoryCounts = {
  saleItems?: number;
  saleReturnItems?: number;
  batches?: number;
  balances?: number;
  movements?: number;
  adjustmentItems?: number;
  transferItems?: number;
  purchaseOrderItems?: number;
  receiptItems?: number;
  prices?: number;
};

function createService(
  overrides: {
    findByIdInOrganization?: ReturnType<typeof vi.fn>;
    findBySku?: ReturnType<typeof vi.fn>;
    findAllInOrganization?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
    record?: ReturnType<typeof vi.fn>;
    runInTransaction?: ReturnType<typeof vi.fn>;
    /** Whether each parent lookup resolves. Defaults to all four resolving. */
    parents?: {
      category?: unknown;
      brand?: unknown;
      unit?: unknown;
      taxCategory?: unknown;
    };
    /** How many times each parent lookup was called. */
    lookups?: {
      category?: ReturnType<typeof vi.fn>;
      brand?: ReturnType<typeof vi.fn>;
      unit?: ReturnType<typeof vi.fn>;
      taxCategory?: ReturnType<typeof vi.fn>;
    };
    history?: HistoryCounts;
  } = {},
) {
  const mocks = {
    findByIdInOrganization:
      overrides.findByIdInOrganization ??
      vi.fn().mockResolvedValue({ id: PRODUCT_ID, sku: 'COK-500' }),
    findBySku: overrides.findBySku ?? vi.fn().mockResolvedValue(null),
    findAllInOrganization:
      overrides.findAllInOrganization ??
      vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: overrides.create ?? vi.fn().mockResolvedValue({ id: PRODUCT_ID }),
    update: overrides.update ?? vi.fn().mockResolvedValue({ id: PRODUCT_ID }),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };
  const productRepository = mocks as unknown as ProductRepository;

  const parents = overrides.parents ?? {};
  const lookups = overrides.lookups ?? {};
  const categoryLookup =
    lookups.category ??
    vi
      .fn()
      .mockResolvedValue(
        'category' in parents ? parents.category : { id: CATEGORY_ID },
      );
  const brandLookup =
    lookups.brand ??
    vi
      .fn()
      .mockResolvedValue('brand' in parents ? parents.brand : { id: BRAND_ID });
  const unitLookup =
    lookups.unit ??
    vi
      .fn()
      .mockResolvedValue('unit' in parents ? parents.unit : { id: UNIT_ID });
  const taxLookup =
    lookups.taxCategory ??
    vi
      .fn()
      .mockResolvedValue(
        'taxCategory' in parents
          ? parents.taxCategory
          : { id: TAX_CATEGORY_ID },
      );

  const categoryRepository = {
    findByIdInOrganization: categoryLookup,
  } as unknown as CategoryRepository;
  const brandRepository = {
    findByIdInOrganization: brandLookup,
  } as unknown as BrandRepository;
  const unitRepository = {
    findByIdInOrganization: unitLookup,
  } as unknown as UnitRepository;

  const audit = {
    record: overrides.record ?? vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;

  const history = overrides.history ?? {};
  const count = (value: number | undefined) =>
    vi.fn().mockResolvedValue(value ?? 0);

  const saleItemCount = count(history.saleItems);
  const saleReturnItemCount = count(history.saleReturnItems);
  const productBatchCount = count(history.batches);
  const inventoryBalanceCount = count(history.balances);
  const inventoryMovementCount = count(history.movements);
  const stockAdjustmentItemCount = count(history.adjustmentItems);
  const stockTransferItemCount = count(history.transferItems);
  const purchaseOrderItemCount = count(history.purchaseOrderItems);
  const goodsReceiptItemCount = count(history.receiptItems);
  const productPriceCount = count(history.prices);

  // The same ten delegates are exposed on the transaction client, because the
  // service resolves `tx ?? this.prisma.client` before counting. Without them an
  // ambient-transaction delete would fail on a missing delegate rather than on
  // anything the test is actually asserting.
  const tx = {
    product: {},
    saleItem: { count: saleItemCount },
    saleReturnItem: { count: saleReturnItemCount },
    productBatch: { count: productBatchCount },
    inventoryBalance: { count: inventoryBalanceCount },
    inventoryMovement: { count: inventoryMovementCount },
    stockAdjustmentItem: { count: stockAdjustmentItemCount },
    stockTransferItem: { count: stockTransferItemCount },
    purchaseOrderItem: { count: purchaseOrderItemCount },
    goodsReceiptItem: { count: goodsReceiptItemCount },
    productPrice: { count: productPriceCount },
  } as unknown as PrismaTx;

  const prisma = {
    client: {
      taxCategory: { findFirst: taxLookup },
      saleItem: { count: saleItemCount },
      saleReturnItem: { count: saleReturnItemCount },
      productBatch: { count: productBatchCount },
      inventoryBalance: { count: inventoryBalanceCount },
      inventoryMovement: { count: inventoryMovementCount },
      stockAdjustmentItem: { count: stockAdjustmentItemCount },
      stockTransferItem: { count: stockTransferItemCount },
      purchaseOrderItem: { count: purchaseOrderItemCount },
      goodsReceiptItem: { count: goodsReceiptItemCount },
      productPrice: { count: productPriceCount },
    },
    runInTransaction: overrides.runInTransaction ?? vi.fn(),
  } as unknown as PrismaService;

  const runInTransaction = (
    prisma as unknown as { runInTransaction: ReturnType<typeof vi.fn> }
  ).runInTransaction;
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );

  return {
    service: new ProductService(
      productRepository,
      categoryRepository,
      brandRepository,
      unitRepository,
      prisma,
      audit,
    ),
    repository: productRepository,
    audit,
    prisma,
    runInTransaction,
    findBySku: mocks.findBySku,
    findAllInOrganization: mocks.findAllInOrganization,
    create: mocks.create,
    update: mocks.update,
    remove: mocks.delete,
    lookups: {
      category: categoryLookup,
      brand: brandLookup,
      unit: unitLookup,
      taxCategory: taxLookup,
    },
    tx,
  };
}

describe('ProductService reads', () => {
  it('reads a product only inside the caller organization', async () => {
    const findByIdInOrganization = vi
      .fn()
      .mockResolvedValue({ id: PRODUCT_ID, sku: 'COK-500' });
    const { service } = createService({ findByIdInOrganization });

    await service.findById(ctx, PRODUCT_ID);

    expect(findByIdInOrganization).toHaveBeenCalledWith(
      PRODUCT_ID,
      ORG_ID,
      undefined,
    );
  });

  it('reports a product in another organization as not found', async () => {
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.findById(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product not found',
    );
    await expect(service.findById(ctx, PRODUCT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('scopes the list to the caller organization', async () => {
    const { service, findAllInOrganization } = createService();

    await service.findAll(ctx, { page: 1, limit: 20 });

    expect(findAllInOrganization).toHaveBeenCalledWith(
      { page: 1, limit: 20 },
      ORG_ID,
      undefined,
    );
  });
});

describe('ProductService.create', () => {
  it('takes the organization from the principal, never from the payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      name: 'Coke 500ml',
      sku: 'COK-500',
      organizationId: OTHER_ORG_ID,
    } as never);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.anything(),
    );
  });

  it('creates a product active regardless of any status in the payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      name: 'Coke 500ml',
      sku: 'COK-500',
      status: 'inactive',
    } as never);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.anything(),
    );
  });

  it('rejects a SKU that already exists in the organization', async () => {
    const { service } = createService({
      findBySku: vi.fn().mockResolvedValue({ id: 'other-product' }),
    });

    await expect(
      service.create(ctx, { name: 'Coke', sku: 'COK-500' }),
    ).rejects.toThrow('Product with this SKU already exists in organization');
    await expect(
      service.create(ctx, { name: 'Coke', sku: 'COK-500' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows the same SKU in another organization', async () => {
    const findBySku = vi.fn().mockResolvedValue(null);
    const { service } = createService({ findBySku });

    await service.create(ctx, { name: 'Coke', sku: 'COK-500' });

    // The lookup is organization-scoped, so an existing row in a different
    // organization is simply not returned.
    expect(findBySku).toHaveBeenCalledWith('COK-500', ORG_ID, undefined);
  });

  it('stores only the fields the payload supplied', async () => {
    const create = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ create });

    await service.create(ctx, { name: 'Coke', sku: 'COK-500' });

    const data = create.mock.calls[0][0] as Record<string, unknown>;
    expect(data).toEqual({
      organizationId: ORG_ID,
      name: 'Coke',
      sku: 'COK-500',
      status: 'active',
    });
    expect('categoryId' in data).toBe(false);
    expect('defaultSellingPrice' in data).toBe(false);
  });

  it('does not look up any parent when none was supplied', async () => {
    const { service, lookups } = createService();

    await service.create(ctx, { name: 'Coke', sku: 'COK-500' });

    expect(lookups.category).not.toHaveBeenCalled();
    expect(lookups.brand).not.toHaveBeenCalled();
    expect(lookups.unit).not.toHaveBeenCalled();
    expect(lookups.taxCategory).not.toHaveBeenCalled();
  });

  it('checks every supplied parent against the caller organization', async () => {
    const { service, lookups } = createService();

    await service.create(ctx, {
      name: 'Coke',
      sku: 'COK-500',
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
      unitId: UNIT_ID,
      taxCategoryId: TAX_CATEGORY_ID,
    });

    expect(lookups.category).toHaveBeenCalledWith(
      CATEGORY_ID,
      ORG_ID,
      undefined,
    );
    expect(lookups.brand).toHaveBeenCalledWith(BRAND_ID, ORG_ID, undefined);
    expect(lookups.unit).toHaveBeenCalledWith(UNIT_ID, ORG_ID, undefined);
    // The tax category has no repository until Task 05.07, so it is reached
    // through the Prisma delegate and the organization filter lives in the
    // where clause rather than in positional arguments.
    expect(lookups.taxCategory).toHaveBeenCalledWith({
      where: { id: TAX_CATEGORY_ID, organizationId: ORG_ID },
    });
  });

  it('refuses a category from another organization', async () => {
    const { service, create } = createService({ parents: { category: null } });

    await expect(
      service.create(ctx, {
        name: 'Coke',
        sku: 'COK-500',
        categoryId: CATEGORY_ID,
      }),
    ).rejects.toThrow('Invalid categoryId for this organization');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a brand from another organization', async () => {
    const { service } = createService({ parents: { brand: null } });

    await expect(
      service.create(ctx, { name: 'Coke', sku: 'COK-500', brandId: BRAND_ID }),
    ).rejects.toThrow('Invalid brandId for this organization');
  });

  it('refuses a unit from another organization', async () => {
    const { service } = createService({ parents: { unit: null } });

    await expect(
      service.create(ctx, { name: 'Coke', sku: 'COK-500', unitId: UNIT_ID }),
    ).rejects.toThrow('Invalid unitId for this organization');
  });

  it('refuses a tax category from another organization', async () => {
    const { service } = createService({ parents: { taxCategory: null } });

    await expect(
      service.create(ctx, {
        name: 'Coke',
        sku: 'COK-500',
        taxCategoryId: TAX_CATEGORY_ID,
      }),
    ).rejects.toThrow('Invalid taxCategoryId for this organization');
  });

  it('treats an explicit null parent as "clear it" rather than "check it"', async () => {
    const create = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service, lookups } = createService({ create });

    await service.create(ctx, {
      name: 'Coke',
      sku: 'COK-500',
      categoryId: null,
    });

    expect(lookups.category).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null }),
      expect.anything(),
    );
  });

  it('stores the exact decimal strings it was given', async () => {
    const create = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      name: 'Coke',
      sku: 'COK-500',
      defaultPurchasePrice: '45.50',
      defaultSellingPrice: '60',
      reorderLevel: '10.000',
      reorderQuantity: null,
    });

    expect(create).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        name: 'Coke',
        sku: 'COK-500',
        status: 'active',
        defaultPurchasePrice: '45.50',
        defaultSellingPrice: '60',
        reorderLevel: '10.000',
        reorderQuantity: null,
      },
      expect.anything(),
    );
  });

  it('audits the create inside the business transaction', async () => {
    const { service, audit, tx } = createService();

    await service.create(ctx, { name: 'Coke', sku: 'COK-500' });

    expect(audit.record).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'product.create',
        entity: 'Product',
        entityId: PRODUCT_ID,
        after: { id: PRODUCT_ID },
      },
      tx,
    );
  });

  it('rolls back the product when the audit write fails', async () => {
    const { service, remove } = createService({
      record: vi.fn().mockRejectedValue(new Error('audit unavailable')),
    });

    await expect(
      service.create(ctx, { name: 'Coke', sku: 'COK-500' }),
    ).rejects.toThrow('audit unavailable');
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('ProductService.update', () => {
  it('writes only the fields the payload supplied', async () => {
    const update = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ update });

    await service.update(ctx, PRODUCT_ID, { name: 'Coke 500ml' });

    expect(update).toHaveBeenCalledWith(
      PRODUCT_ID,
      { name: 'Coke 500ml' },
      expect.anything(),
    );
  });

  it('clears a parent when it is explicitly set to null', async () => {
    const update = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service, lookups } = createService({ update });

    await service.update(ctx, PRODUCT_ID, { brandId: null });

    expect(lookups.brand).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      PRODUCT_ID,
      { brandId: null },
      expect.anything(),
    );
  });

  it('clears a price when it is explicitly set to null', async () => {
    const update = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ update });

    await service.update(ctx, PRODUCT_ID, { defaultSellingPrice: null });

    expect(update).toHaveBeenCalledWith(
      PRODUCT_ID,
      { defaultSellingPrice: null },
      expect.anything(),
    );
  });

  it('does not re-check the SKU when the payload leaves it alone', async () => {
    const { service, findBySku } = createService();

    await service.update(ctx, PRODUCT_ID, { name: 'Renamed' });

    expect(findBySku).not.toHaveBeenCalled();
  });

  it('does not re-check the SKU when the payload repeats the same SKU', async () => {
    const { service, findBySku } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue({ id: PRODUCT_ID, sku: 'COK-500' }),
    });

    await service.update(ctx, PRODUCT_ID, { sku: 'COK-500' });

    expect(findBySku).not.toHaveBeenCalled();
  });

  it('rejects a new SKU that another product already uses', async () => {
    const { service, update } = createService({
      findBySku: vi.fn().mockResolvedValue({ id: 'other-product' }),
    });

    await expect(
      service.update(ctx, PRODUCT_ID, { sku: 'COK-600' }),
    ).rejects.toThrow('Product with this SKU already exists in organization');
    expect(update).not.toHaveBeenCalled();
  });

  it('lets a product keep its own SKU on update', async () => {
    const update = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({
      findBySku: vi.fn().mockResolvedValue({ id: PRODUCT_ID }),
      update,
    });

    await service.update(ctx, PRODUCT_ID, { sku: 'COK-500' });

    expect(update).toHaveBeenCalled();
  });

  it('checks only the parents the payload actually changes', async () => {
    const { service, lookups } = createService();

    await service.update(ctx, PRODUCT_ID, { unitId: UNIT_ID });

    expect(lookups.unit).toHaveBeenCalledWith(UNIT_ID, ORG_ID, undefined);
    expect(lookups.category).not.toHaveBeenCalled();
    expect(lookups.brand).not.toHaveBeenCalled();
    expect(lookups.taxCategory).not.toHaveBeenCalled();
  });

  it('refuses to move a product into another organization category', async () => {
    const { service, update } = createService({ parents: { category: null } });

    await expect(
      service.update(ctx, PRODUCT_ID, { categoryId: CATEGORY_ID }),
    ).rejects.toThrow('Invalid categoryId for this organization');
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a product in another organization as not found', async () => {
    const { service, update } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(ctx, PRODUCT_ID, { name: 'Renamed' }),
    ).rejects.toThrow('Product not found');
    expect(update).not.toHaveBeenCalled();
  });

  it('audits the before and after of an update', async () => {
    const { service, audit, tx } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue({ id: PRODUCT_ID, sku: 'COK-500', name: 'Old' }),
      update: vi.fn().mockResolvedValue({ id: PRODUCT_ID, name: 'New' }),
    });

    await service.update(ctx, PRODUCT_ID, { name: 'New' });

    expect(audit.record).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'product.update',
        entity: 'Product',
        entityId: PRODUCT_ID,
        before: { id: PRODUCT_ID, sku: 'COK-500', name: 'Old' },
        after: { id: PRODUCT_ID, name: 'New' },
      },
      tx,
    );
  });

  it('reactivates a product when status is set back to active', async () => {
    const update = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ update });

    await service.update(ctx, PRODUCT_ID, { status: 'active' });

    expect(update).toHaveBeenCalledWith(
      PRODUCT_ID,
      { status: 'active' },
      expect.anything(),
    );
  });
});

describe('ProductService.deactivate', () => {
  it('flips the status to inactive and changes nothing else', async () => {
    const update = vi.fn().mockResolvedValue({ id: PRODUCT_ID });
    const { service } = createService({ update });

    await service.deactivate(ctx, PRODUCT_ID);

    expect(update).toHaveBeenCalledWith(
      PRODUCT_ID,
      { status: 'inactive' },
      expect.anything(),
    );
  });

  it('audits the before and after of a deactivation', async () => {
    const { service, audit, tx } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue({ id: PRODUCT_ID, status: 'active' }),
      update: vi.fn().mockResolvedValue({ id: PRODUCT_ID, status: 'inactive' }),
    });

    await service.deactivate(ctx, PRODUCT_ID);

    expect(audit.record).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'product.deactivate',
        entity: 'Product',
        entityId: PRODUCT_ID,
        before: { id: PRODUCT_ID, status: 'active' },
        after: { id: PRODUCT_ID, status: 'inactive' },
      },
      tx,
    );
  });

  it('reports a product in another organization as not found', async () => {
    const { service, update } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.deactivate(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product not found',
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ProductService.delete', () => {
  it('deletes a product that nothing references', async () => {
    const { service, remove, audit, tx } = createService();

    await service.delete(ctx, PRODUCT_ID);

    expect(remove).toHaveBeenCalledWith(PRODUCT_ID, tx);
    expect(audit.record).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'product.delete',
        entity: 'Product',
        entityId: PRODUCT_ID,
        before: { id: PRODUCT_ID, sku: 'COK-500' },
      },
      tx,
    );
  });

  it('refuses to delete a product that has been sold', async () => {
    const { service, remove } = createService({ history: { saleItems: 1 } });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has sales history; deactivate it instead',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a product that appears in a sale return', async () => {
    const { service, remove } = createService({
      history: { saleReturnItems: 1 },
    });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has sales history; deactivate it instead',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a product that still has a batch', async () => {
    const { service, remove } = createService({ history: { batches: 2 } });

    // A batch row can outlive its balances and movements, so it is counted in
    // its own right rather than being inferred from the inventory tables.
    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has inventory history; deactivate it instead',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a product that has a stock balance', async () => {
    const { service, remove } = createService({ history: { balances: 3 } });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has inventory history; deactivate it instead',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a product that has an inventory movement', async () => {
    const { service } = createService({ history: { movements: 1 } });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has inventory history; deactivate it instead',
    );
  });

  it('refuses to delete a product named by a stock adjustment or transfer', async () => {
    const { service } = createService({ history: { adjustmentItems: 1 } });
    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has inventory history; deactivate it instead',
    );

    const transfer = createService({ history: { transferItems: 1 } });
    await expect(transfer.service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has inventory history; deactivate it instead',
    );
  });

  it('refuses to delete a product on a purchase order', async () => {
    const { service, remove } = createService({
      history: { purchaseOrderItems: 2 },
    });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product is referenced by purchasing records; deactivate it instead',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a product on a goods receipt', async () => {
    const { service } = createService({ history: { receiptItems: 1 } });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product is referenced by purchasing records; deactivate it instead',
    );
  });

  it('refuses to delete a product that has price history', async () => {
    const { service, remove } = createService({ history: { prices: 1 } });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has price history; deactivate it instead',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('raises a bad request rather than a database error', async () => {
    const { service } = createService({ history: { saleItems: 1 } });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('names sales history ahead of price history when both exist', async () => {
    const { service } = createService({
      history: { saleItems: 1, prices: 1 },
    });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product has sales history; deactivate it instead',
    );
  });

  it('reports a product in another organization as not found without counting', async () => {
    const { service, remove } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'Product not found',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('rolls the delete back when the audit write fails', async () => {
    const { service, remove } = createService({
      record: vi.fn().mockRejectedValue(new Error('audit unavailable')),
    });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toThrow(
      'audit unavailable',
    );
    expect(remove).toHaveBeenCalled();
  });
});

describe('ProductService ambient transaction', () => {
  it('joins a caller-supplied transaction instead of opening its own', async () => {
    const { service, runInTransaction, audit, tx } = createService();

    await service.create(ctx, { name: 'Coke', sku: 'COK-500' }, tx);

    expect(runInTransaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('uses the caller transaction for the parent lookups', async () => {
    const { service, lookups, tx } = createService();

    await service.create(
      ctx,
      { name: 'Coke', sku: 'COK-500', categoryId: CATEGORY_ID },
      tx,
    );

    expect(lookups.category).toHaveBeenCalledWith(CATEGORY_ID, ORG_ID, tx);
  });

  it('joins a caller-supplied transaction for a delete', async () => {
    const { service, runInTransaction, remove, tx } = createService();

    await service.delete(ctx, PRODUCT_ID, tx);

    expect(runInTransaction).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(PRODUCT_ID, tx);
  });

  it('counts the blocking history inside the caller transaction', async () => {
    const { service, runInTransaction, tx } = createService({
      history: { saleItems: 1 },
    });

    await expect(service.delete(ctx, PRODUCT_ID, tx)).rejects.toThrow(
      'Product has sales history',
    );
    // The counts came from the transaction client, so the guard and the
    // eventual write see the same snapshot.
    expect(runInTransaction).not.toHaveBeenCalled();
  });
});

describe('ProductService tenant isolation', () => {
  it('never passes a caller-supplied organization to the repository', async () => {
    const { service, create } = createService();

    await service.create(ctx, {
      name: 'Coke',
      sku: 'COK-500',
      organizationId: OTHER_ORG_ID,
    } as never);

    const data = create.mock.calls[0][0] as Record<string, unknown>;
    expect(data.organizationId).toBe(ORG_ID);
  });

  it('refuses a delete for a product in another organization', async () => {
    const { service, remove } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue(null),
    });

    await expect(service.delete(ctx, PRODUCT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
