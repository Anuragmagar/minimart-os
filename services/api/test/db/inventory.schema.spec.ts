import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.stockTransferItem.deleteMany({});
  await prisma.stockTransfer.deleteMany({});
  await prisma.stockAdjustmentItem.deleteMany({});
  await prisma.stockAdjustment.deleteMany({});
  await prisma.inventoryMovement.deleteMany({});
  await prisma.inventoryBalance.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.inventoryLocation.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = `Inv Test ${randomUUID()}`) {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createStore(orgId: string, code = `ST-${randomUUID()}`) {
  return prisma.store.create({
    data: { organizationId: orgId, name: `Store ${code}`, code },
  });
}

async function createLocation(storeId: string, code = `LOC-${randomUUID()}`) {
  return prisma.inventoryLocation.create({
    data: { storeId, name: `Location ${code}`, code },
  });
}

async function createProduct(orgId: string, sku = `INV-${randomUUID()}`) {
  return prisma.product.create({
    data: { organizationId: orgId, name: `Product ${sku}`, sku },
  });
}

describe('InventoryLocation schema', () => {
  it('creates locations scoped to a store with unique codes per store', async () => {
    const org = await createOrg();
    const storeA = await createStore(org.id, 'MAIN');
    const storeB = await createStore(org.id, 'BRANCH');

    const loc = await createLocation(storeA.id, 'FLOOR');
    expect(loc.storeId).toBe(storeA.id);
    expect(loc.status).toBe('active');

    const inB = await prisma.inventoryLocation.create({
      data: { storeId: storeB.id, name: 'Floor', code: 'FLOOR' },
    });
    expect(inB.storeId).toBe(storeB.id);

    await expect(
      prisma.inventoryLocation.create({
        data: { storeId: storeA.id, name: 'Floor B', code: 'FLOOR' },
      }),
    ).rejects.toThrow();
  });
});

describe('ProductBatch schema', () => {
  it('creates a batch with optional dates, supplier deferred and decimal cost', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    await createLocation(store.id);
    const product = await createProduct(org.id);

    const batch = await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: 'B-2026-001',
        manufactureDate: new Date('2026-01-10T00:00:00.000Z'),
        expiryDate: new Date('2026-12-31T00:00:00.000Z'),
        unitCost: '245.75',
      },
    });

    expect(batch.productId).toBe(product.id);
    expect(batch.supplierId).toBeNull();
    expect(batch.unitCost.toString()).toBe('245.75');
    expect(batch.expiryDate?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('orders batches by expiry for FEFO', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    await createLocation(store.id);
    const product = await createProduct(org.id);

    await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: 'FEFO-LATE',
        expiryDate: new Date('2027-06-01T00:00:00.000Z'),
        unitCost: '10',
      },
    });
    await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: 'FEFO-EARLY',
        expiryDate: new Date('2026-05-01T00:00:00.000Z'),
        unitCost: '10',
      },
    });

    const batches = await prisma.productBatch.findMany({
      where: { productId: product.id },
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    });
    expect(batches[0].batchNumber).toBe('FEFO-EARLY');
    expect(batches[1].batchNumber).toBe('FEFO-LATE');
  });

  it('blocks a batch referencing a foreign product', async () => {
    await createOrg();
    await expect(
      prisma.productBatch.create({
        data: {
          productId: randomUUID(),
          batchNumber: 'B',
          unitCost: '10',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('InventoryMovement schema', () => {
  it('records ledger movements with signed decimal quantity and cost', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Cashier',
        phone: `98${randomUUID().slice(0, 8)}`,
        passwordHash: 'hash',
      },
    });

    const inbound = await prisma.inventoryMovement.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        productId: product.id,
        movementType: 'receipt',
        quantity: '48.000',
        unitCost: '200.00',
        operationId: 'OP-RECEIPT-1',
        occurredAt: new Date('2026-09-01T00:00:00.000Z'),
        createdById: user.id,
      },
    });
    const outbound = await prisma.inventoryMovement.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        productId: product.id,
        movementType: 'sale',
        quantity: '-2.500',
        operationId: 'OP-SALE-1',
        occurredAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    });

    expect(Number(inbound.quantity.toString())).toBe(48);
    expect(Number(inbound.unitCost?.toString())).toBe(200);
    expect(inbound.operationId).toBe('OP-RECEIPT-1');
    expect(Number(outbound.quantity.toString())).toBe(-2.5);
  });

  it('allows multiple movements per operation id', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);

    await prisma.inventoryMovement.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        productId: product.id,
        movementType: 'receipt',
        quantity: '10',
        operationId: 'OP-SHARED',
        occurredAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        productId: product.id,
        movementType: 'receipt',
        quantity: '5',
        operationId: 'OP-SHARED',
        occurredAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const rows = await prisma.inventoryMovement.findMany({
      where: { operationId: 'OP-SHARED' },
    });
    expect(rows).toHaveLength(2);
  });

  it('rejects movements referencing foreign location/product/batch/user', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);

    await expect(
      prisma.inventoryMovement.create({
        data: {
          organizationId: org.id,
          locationId: randomUUID(),
          productId: product.id,
          movementType: 'receipt',
          quantity: '1',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryMovement.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          productId: randomUUID(),
          movementType: 'receipt',
          quantity: '1',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryMovement.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          productId: product.id,
          movementType: 'receipt',
          quantity: '1',
          occurredAt: new Date(),
          createdById: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('InventoryBalance schema', () => {
  it('stores quantity/reserved/available projection snapshots with a version', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);

    const balance = await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: product.id,
        quantityOnHand: '123.400',
        reserved: '10.000',
        available: '113.400',
      },
    });

    expect(Number(balance.quantityOnHand.toString())).toBe(123.4);
    expect(Number(balance.reserved.toString())).toBe(10);
    expect(Number(balance.available.toString())).toBe(113.4);
    expect(balance.version).toBe(1);

    const bumped = await prisma.inventoryBalance.update({
      where: { id: balance.id },
      data: { quantityOnHand: '120.000', version: { increment: 1 } },
    });
    expect(bumped.version).toBe(2);
  });

  it('tracks both batch-level and product-level balances for one product', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);
    const batch = await prisma.productBatch.create({
      data: { productId: product.id, batchNumber: 'BAL-B1', unitCost: '10' },
    });

    await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: product.id,
        batchId: batch.id,
        quantityOnHand: '20',
      },
    });
    await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: product.id,
        quantityOnHand: '5',
      },
    });

    const rows = await prisma.inventoryBalance.findMany({
      where: { locationId: location.id, productId: product.id },
      orderBy: { quantityOnHand: 'desc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].batchId).toBe(batch.id);
    expect(rows[1].batchId).toBeNull();
  });

  it('blocks a batch-level balance referencing a foreign batch', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);

    await expect(
      prisma.inventoryBalance.create({
        data: {
          locationId: location.id,
          productId: product.id,
          batchId: randomUUID(),
          quantityOnHand: '1',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Stock adjustment and transfer schema', () => {
  it('creates an adjustment with signed item quantities and cascades items', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);

    const adjustment = await prisma.stockAdjustment.create({
      data: {
        locationId: location.id,
        reason: 'Damaged goods',
        status: 'pending',
        notedAt: new Date('2026-09-03T00:00:00.000Z'),
        items: {
          create: [
            { productId: product.id, quantity: '-3.000' },
            { productId: product.id, quantity: '1.000' },
          ],
        },
      },
    });

    expect(adjustment.status).toBe('pending');
    expect(adjustment.completedAt).toBeNull();

    const items = await prisma.stockAdjustmentItem.findMany({
      where: { adjustmentId: adjustment.id },
      orderBy: { quantity: 'asc' },
    });
    expect(items).toHaveLength(2);
    expect(Number(items[0].quantity.toString())).toBe(-3);

    await prisma.stockAdjustment.delete({ where: { id: adjustment.id } });
    expect(
      await prisma.stockAdjustmentItem.findMany({
        where: { adjustmentId: adjustment.id },
      }),
    ).toHaveLength(0);
  });

  it('creates a transfer between locations with cascading items', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const source = await createLocation(store.id, 'SRC');
    const destination = await createLocation(store.id, 'DST');
    const product = await createProduct(org.id);

    const transfer = await prisma.stockTransfer.create({
      data: {
        sourceLocationId: source.id,
        destinationLocationId: destination.id,
        status: 'draft',
        transferredAt: new Date('2026-09-04T00:00:00.000Z'),
        items: {
          create: [{ productId: product.id, quantity: '6.000' }],
        },
      },
    });

    expect(transfer.sourceLocationId).toBe(source.id);
    expect(transfer.destinationLocationId).toBe(destination.id);

    const items = await prisma.stockTransferItem.findMany({
      where: { transferId: transfer.id },
    });
    expect(Number(items[0].quantity.toString())).toBe(6);

    await prisma.stockTransfer.delete({ where: { id: transfer.id } });
    expect(
      await prisma.stockTransferItem.findMany({
        where: { transferId: transfer.id },
      }),
    ).toHaveLength(0);
  });

  it('rejects items referencing foreign products', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);

    await expect(
      prisma.stockAdjustment.create({
        data: {
          locationId: location.id,
          reason: 'Count',
          status: 'pending',
          notedAt: new Date(),
          items: { create: [{ productId: randomUUID(), quantity: '1' }] },
        },
      }),
    ).rejects.toThrow();
  });

  it('prevents deleting referenced master data', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Clerk',
        phone: `97${randomUUID().slice(0, 8)}`,
        passwordHash: 'hash',
      },
    });
    const batch = await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: 'PROTECT-B1',
        unitCost: '10',
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        productId: product.id,
        batchId: batch.id,
        movementType: 'receipt',
        quantity: '5',
        occurredAt: new Date(),
        createdById: user.id,
      },
    });

    await expect(
      prisma.productBatch.delete({ where: { id: batch.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.product.delete({ where: { id: product.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryLocation.delete({ where: { id: location.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.user.delete({ where: { id: user.id } }),
    ).rejects.toThrow();
  });
});

describe('Inventory schema structure', () => {
  it('enforces expected foreign-key deletion actions', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname IN (
           'inventory_balances', 'inventory_locations', 'inventory_movements',
           'product_batches', 'stock_adjustment_items', 'stock_adjustments',
           'stock_transfer_items', 'stock_transfers'
         )
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      {
        table_name: 'inventory_balances',
        column_name: 'batch_id',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_balances',
        column_name: 'location_id',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_balances',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_locations',
        column_name: 'store_id',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_movements',
        column_name: 'batch_id',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_movements',
        column_name: 'created_by',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_movements',
        column_name: 'location_id',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_movements',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      {
        table_name: 'inventory_movements',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'product_batches',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'product_batches',
        column_name: 'supplier_id',
        on_delete: 'r',
      },
      {
        table_name: 'stock_adjustment_items',
        column_name: 'adjustment_id',
        on_delete: 'c',
      },
      {
        table_name: 'stock_adjustment_items',
        column_name: 'batch_id',
        on_delete: 'r',
      },
      {
        table_name: 'stock_adjustment_items',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'stock_adjustments',
        column_name: 'location_id',
        on_delete: 'r',
      },
      {
        table_name: 'stock_transfer_items',
        column_name: 'batch_id',
        on_delete: 'r',
      },
      {
        table_name: 'stock_transfer_items',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'stock_transfer_items',
        column_name: 'transfer_id',
        on_delete: 'c',
      },
      {
        table_name: 'stock_transfers',
        column_name: 'destination_location_id',
        on_delete: 'r',
      },
      {
        table_name: 'stock_transfers',
        column_name: 'source_location_id',
        on_delete: 'r',
      },
    ]);
  });

  it('declares NUMERIC columns with the documented scales', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE data_type = 'numeric'
         AND table_schema = 'public'
         AND table_name IN (
           'inventory_balances', 'inventory_movements', 'product_batches',
           'stock_adjustment_items', 'stock_transfer_items'
         )
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'inventory_balances',
        column_name: 'available',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'inventory_balances',
        column_name: 'quantity_on_hand',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'inventory_balances',
        column_name: 'reserved',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'inventory_movements',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'inventory_movements',
        column_name: 'unit_cost',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'product_batches',
        column_name: 'unit_cost',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'stock_adjustment_items',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'stock_transfer_items',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
    ]);
  });

  it('defines the expected indexes on inventory tables', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('product_batches', 'inventory_balances', 'inventory_movements', 'inventory_locations')
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'inventory_balances_location_id_product_id_batch_id_idx' },
      { indexname: 'inventory_balances_location_product_batch_key' },
      { indexname: 'inventory_balances_pkey' },
      { indexname: 'inventory_locations_pkey' },
      { indexname: 'inventory_locations_store_id_code_key' },
      {
        indexname:
          'inventory_movements_location_id_product_id_batch_id_occurre_idx',
      },
      { indexname: 'inventory_movements_operation_id_idx' },
      { indexname: 'inventory_movements_organization_id_occurred_at_idx' },
      { indexname: 'inventory_movements_pkey' },
      { indexname: 'product_batches_pkey' },
      { indexname: 'product_batches_product_id_expiry_date_idx' },
    ]);
  });

  it('keeps supplier_id a nullable uuid and ledger columns typed as designed', async () => {
    const columns = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'product_batches' AND column_name = 'supplier_id')
           OR (table_name = 'inventory_balances' AND column_name = 'version')
           OR (table_name = 'inventory_movements' AND column_name = 'movement_type')
         )
       ORDER BY table_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
      column_default: string | null;
    }>;

    expect(columns).toEqual([
      {
        table_name: 'inventory_balances',
        column_name: 'version',
        is_nullable: 'NO',
        data_type: 'integer',
        column_default: '1',
      },
      {
        table_name: 'inventory_movements',
        column_name: 'movement_type',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        table_name: 'product_batches',
        column_name: 'supplier_id',
        is_nullable: 'YES',
        data_type: 'uuid',
        column_default: null,
      },
    ]);
  });

  it('defines InventoryLocationStatus with exactly active and inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname = 'InventoryLocationStatus'
       ORDER BY e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'InventoryLocationStatus', enumlabel: 'active' },
      { typname: 'InventoryLocationStatus', enumlabel: 'inactive' },
    ]);
  });
});
