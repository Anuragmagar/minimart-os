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
  await prisma.supplierPayment.deleteMany({});
  await prisma.supplierLedgerEntry.deleteMany({});
  await prisma.goodsReceiptItem.deleteMany({});
  await prisma.goodsReceipt.deleteMany({});
  await prisma.purchaseOrderItem.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = `Pur Test ${randomUUID()}`) {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createStore(orgId: string, code = `ST-${randomUUID()}`) {
  return prisma.store.create({
    data: { organizationId: orgId, name: `Store ${code}`, code },
  });
}

async function createSupplier(orgId: string, code = `SUP-${randomUUID()}`) {
  return prisma.supplier.create({
    data: { organizationId: orgId, name: `Supplier ${code}`, code },
  });
}

async function createProduct(orgId: string, sku = `PUR-${randomUUID()}`) {
  return prisma.product.create({
    data: { organizationId: orgId, name: `Product ${sku}`, sku },
  });
}

describe('Supplier schema', () => {
  it('creates a supplier scoped to an organization with defaults', async () => {
    const org = await createOrg();
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: org.id,
        name: 'Janaki Wholesale',
        code: 'JANAKI',
        panNumber: '301234567',
        contact: '9800000000',
        paymentTerms: 'net-30',
        creditLimit: '50000.00',
      },
    });

    expect(supplier.organizationId).toBe(org.id);
    expect(supplier.panNumber).toBe('301234567');
    expect(Number(supplier.creditLimit?.toString())).toBe(50000);
    expect(supplier.status).toBe('active');
  });

  it('enforces unique supplier codes within an organization', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.supplier.create({
      data: { organizationId: orgA.id, name: 'A', code: 'SUP1' },
    });
    const inB = await prisma.supplier.create({
      data: { organizationId: orgB.id, name: 'B', code: 'SUP1' },
    });

    expect(inB.organizationId).toBe(orgB.id);
    await expect(
      prisma.supplier.create({
        data: { organizationId: orgA.id, name: 'A2', code: 'SUP1' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a supplier referencing a foreign organization', async () => {
    await expect(
      prisma.supplier.create({
        data: { organizationId: randomUUID(), name: 'X', code: 'X' },
      }),
    ).rejects.toThrow();
  });
});

describe('PurchaseOrder schema', () => {
  it('creates a purchase order with items and decimal totals', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const supplier = await createSupplier(org.id);
    const product = await createProduct(org.id);
    const product2 = await createProduct(org.id, 'PUR-DUP');

    const po = await prisma.purchaseOrder.create({
      data: {
        supplierId: supplier.id,
        storeId: store.id,
        status: 'draft',
        orderDate: new Date('2026-09-10T00:00:00.000Z'),
        expectedDate: new Date('2026-09-20T00:00:00.000Z'),
        subTotal: '10450.00',
        discountAmount: '450.00',
        taxAmount: '0.00',
        total: '10000.00',
        items: {
          create: [
            {
              productId: product.id,
              quantity: '10.000',
              unitCost: '550.00',
              lineTotal: '5500.00',
            },
            {
              productId: product2.id,
              quantity: '5.000',
              unitCost: '990.00',
              lineTotal: '4950.00',
            },
          ],
        },
      },
    });

    expect(po.status).toBe('draft');
    expect(Number(po.total.toString())).toBe(10000);
    expect(po.expectedDate?.toISOString()).toBe('2026-09-20T00:00:00.000Z');

    const items = await prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: po.id },
      orderBy: { lineTotal: 'asc' },
    });
    expect(items).toHaveLength(2);
    expect(Number(items[0].quantity.toString())).toBe(5);
  });

  it('cascades items when the purchase order is deleted', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const supplier = await createSupplier(org.id);
    const product = await createProduct(org.id);

    const po = await prisma.purchaseOrder.create({
      data: {
        supplierId: supplier.id,
        storeId: store.id,
        status: 'draft',
        orderDate: new Date(),
        items: {
          create: [
            {
              productId: product.id,
              quantity: '2',
              unitCost: '100',
              lineTotal: '200',
            },
          ],
        },
      },
    });

    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    expect(
      await prisma.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
      }),
    ).toHaveLength(0);
  });

  it('rejects a purchase order referencing foreign supplier or store', async () => {
    const org = await createOrg();
    const supplier = await createSupplier(org.id);

    await expect(
      prisma.purchaseOrder.create({
        data: {
          supplierId: randomUUID(),
          storeId: randomUUID(),
          status: 'draft',
          orderDate: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.purchaseOrder.create({
        data: {
          supplierId: supplier.id,
          storeId: randomUUID(),
          status: 'draft',
          orderDate: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('GoodsReceipt schema', () => {
  it('creates a direct receipt without a purchase order and links batches', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const supplier = await createSupplier(org.id);
    const product = await createProduct(org.id);
    const batch = await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: 'REC-B1',
        unitCost: '120',
        supplierId: supplier.id,
      },
    });

    const receipt = await prisma.goodsReceipt.create({
      data: {
        supplierId: supplier.id,
        storeId: store.id,
        status: 'received',
        receivedAt: new Date('2026-09-12T00:00:00.000Z'),
        items: {
          create: [
            {
              productId: product.id,
              batchId: batch.id,
              quantity: '24.000',
              unitCost: '120.00',
              lineTotal: '2880.00',
            },
          ],
        },
      },
    });

    expect(receipt.purchaseOrderId).toBeNull();
    expect(receipt.status).toBe('received');

    const items = await prisma.goodsReceiptItem.findMany({
      where: { receiptId: receipt.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].batchId).toBe(batch.id);
    expect(Number(items[0].lineTotal.toString())).toBe(2880);
  });

  it('links a goods receipt to its purchase order', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const supplier = await createSupplier(org.id);
    const product = await createProduct(org.id);
    const po = await prisma.purchaseOrder.create({
      data: {
        supplierId: supplier.id,
        storeId: store.id,
        status: 'ordered',
        orderDate: new Date(),
      },
    });

    const receipt = await prisma.goodsReceipt.create({
      data: {
        purchaseOrderId: po.id,
        supplierId: supplier.id,
        storeId: store.id,
        status: 'received',
        receivedAt: new Date(),
        items: {
          create: [
            {
              productId: product.id,
              quantity: '3',
              unitCost: '50',
              lineTotal: '150',
            },
          ],
        },
      },
    });

    expect(receipt.purchaseOrderId).toBe(po.id);
  });

  it('rejects a receipt referencing a foreign batch', async () => {
    const org = await createOrg();
    await createStore(org.id);
    await createSupplier(org.id);
    const product = await createProduct(org.id);

    await expect(
      prisma.goodsReceiptItem.create({
        data: {
          receiptId: randomUUID(),
          productId: product.id,
          batchId: randomUUID(),
          quantity: '1',
          unitCost: '1',
          lineTotal: '1',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Supplier ledger and payment schema', () => {
  it('records chronological ledger entries with debit/credit direction', async () => {
    const org = await createOrg();
    const supplier = await createSupplier(org.id);

    await prisma.supplierLedgerEntry.create({
      data: {
        supplierId: supplier.id,
        entryType: 'debit',
        amount: '10000.00',
        balanceAfter: '10000.00',
        referenceType: 'goods_receipt',
        occurredAt: new Date('2026-09-12T06:00:00.000Z'),
      },
    });
    await prisma.supplierLedgerEntry.create({
      data: {
        supplierId: supplier.id,
        entryType: 'credit',
        amount: '4000.00',
        balanceAfter: '6000.00',
        referenceType: 'supplier_payment',
        occurredAt: new Date('2026-09-13T06:00:00.000Z'),
      },
    });

    const entries = await prisma.supplierLedgerEntry.findMany({
      where: { supplierId: supplier.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].entryType).toBe('debit');
    expect(Number(entries[0].balanceAfter.toString())).toBe(10000);
    expect(Number(entries[1].balanceAfter.toString())).toBe(6000);
  });

  it('records a supplier payment with method and reference', async () => {
    const org = await createOrg();
    const supplier = await createSupplier(org.id);

    const payment = await prisma.supplierPayment.create({
      data: {
        supplierId: supplier.id,
        paymentMethod: 'bank_transfer',
        amount: '4000.00',
        reference: 'CHK-001',
        paidAt: new Date('2026-09-13T00:00:00.000Z'),
      },
    });

    expect(payment.paymentMethod).toBe('bank_transfer');
    expect(payment.reference).toBe('CHK-001');
    expect(Number(payment.amount.toString())).toBe(4000);
    expect(payment.paidAt.toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it('prevents deleting a supplier with financial history', async () => {
    const org = await createOrg();
    const supplier = await createSupplier(org.id);
    await prisma.supplierLedgerEntry.create({
      data: {
        supplierId: supplier.id,
        entryType: 'debit',
        amount: '10',
        balanceAfter: '10',
        occurredAt: new Date(),
      },
    });

    await expect(
      prisma.supplier.delete({ where: { id: supplier.id } }),
    ).rejects.toThrow();
  });

  it('prevents deleting referenced master data', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const supplier = await createSupplier(org.id);
    const product = await createProduct(org.id);
    const batch = await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: 'PROT-P7',
        unitCost: '5',
        supplierId: supplier.id,
      },
    });

    await prisma.goodsReceipt.create({
      data: {
        supplierId: supplier.id,
        storeId: store.id,
        status: 'received',
        receivedAt: new Date(),
        items: {
          create: [
            {
              productId: product.id,
              batchId: batch.id,
              quantity: '1',
              unitCost: '5',
              lineTotal: '5',
            },
          ],
        },
      },
    });

    await expect(
      prisma.productBatch.delete({ where: { id: batch.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.product.delete({ where: { id: product.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.store.delete({ where: { id: store.id } }),
    ).rejects.toThrow();
  });

  it('links product batches to suppliers now that purchases exist', async () => {
    const org = await createOrg();
    const supplier = await createSupplier(org.id);
    const product = await createProduct(org.id);

    const batch = await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: 'SUP-B1',
        unitCost: '10',
        supplierId: supplier.id,
      },
    });
    expect(batch.supplierId).toBe(supplier.id);

    await expect(
      prisma.productBatch.create({
        data: {
          productId: product.id,
          batchNumber: 'SUP-B2',
          unitCost: '10',
          supplierId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Purchasing schema structure', () => {
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
           'goods_receipt_items', 'goods_receipts', 'product_batches',
           'purchase_order_items', 'purchase_orders',
           'supplier_ledger_entries', 'supplier_payments', 'suppliers'
         )
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      {
        table_name: 'goods_receipt_items',
        column_name: 'batch_id',
        on_delete: 'r',
      },
      {
        table_name: 'goods_receipt_items',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'goods_receipt_items',
        column_name: 'receipt_id',
        on_delete: 'c',
      },
      {
        table_name: 'goods_receipts',
        column_name: 'purchase_order_id',
        on_delete: 'r',
      },
      { table_name: 'goods_receipts', column_name: 'store_id', on_delete: 'r' },
      {
        table_name: 'goods_receipts',
        column_name: 'supplier_id',
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
        table_name: 'purchase_order_items',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'purchase_order_items',
        column_name: 'purchase_order_id',
        on_delete: 'c',
      },
      {
        table_name: 'purchase_orders',
        column_name: 'store_id',
        on_delete: 'r',
      },
      {
        table_name: 'purchase_orders',
        column_name: 'supplier_id',
        on_delete: 'r',
      },
      {
        table_name: 'supplier_ledger_entries',
        column_name: 'supplier_id',
        on_delete: 'r',
      },
      {
        table_name: 'supplier_payments',
        column_name: 'supplier_id',
        on_delete: 'r',
      },
      {
        table_name: 'suppliers',
        column_name: 'organization_id',
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
           'suppliers', 'purchase_orders', 'purchase_order_items',
           'goods_receipt_items', 'supplier_ledger_entries', 'supplier_payments'
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
        table_name: 'goods_receipt_items',
        column_name: 'line_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'goods_receipt_items',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'goods_receipt_items',
        column_name: 'unit_cost',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'purchase_order_items',
        column_name: 'line_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'purchase_order_items',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'purchase_order_items',
        column_name: 'unit_cost',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'purchase_orders',
        column_name: 'discount_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'purchase_orders',
        column_name: 'sub_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'purchase_orders',
        column_name: 'tax_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'purchase_orders',
        column_name: 'total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'supplier_ledger_entries',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'supplier_ledger_entries',
        column_name: 'balance_after',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'supplier_payments',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'suppliers',
        column_name: 'credit_limit',
        numeric_precision: 14,
        numeric_scale: 2,
      },
    ]);
  });

  it('defines the expected indexes on purchasing tables', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('suppliers', 'purchase_orders', 'goods_receipts', 'supplier_ledger_entries', 'supplier_payments')
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'goods_receipts_pkey' },
      { indexname: 'goods_receipts_supplier_id_received_at_idx' },
      { indexname: 'purchase_orders_pkey' },
      { indexname: 'purchase_orders_supplier_id_order_date_idx' },
      { indexname: 'supplier_ledger_entries_pkey' },
      { indexname: 'supplier_ledger_entries_supplier_id_occurred_at_idx' },
      { indexname: 'supplier_payments_pkey' },
      { indexname: 'supplier_payments_supplier_id_paid_at_idx' },
      { indexname: 'suppliers_organization_id_code_key' },
      { indexname: 'suppliers_organization_id_name_idx' },
      { indexname: 'suppliers_pkey' },
    ]);
  });

  it('types po/gr status as text and totals default to zero', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'purchase_orders' AND column_name IN ('status', 'total'))
           OR (table_name = 'goods_receipts' AND column_name = 'status')
           OR (table_name = 'goods_receipts' AND column_name = 'purchase_order_id')
         )
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
      column_default: string | null;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'goods_receipts',
        column_name: 'purchase_order_id',
        is_nullable: 'YES',
        data_type: 'uuid',
        column_default: null,
      },
      {
        table_name: 'goods_receipts',
        column_name: 'status',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        table_name: 'purchase_orders',
        column_name: 'status',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        table_name: 'purchase_orders',
        column_name: 'total',
        is_nullable: 'NO',
        data_type: 'numeric',
        column_default: '0',
      },
    ]);
  });

  it('defines SupplierStatus with exactly active and inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname = 'SupplierStatus'
       ORDER BY e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'SupplierStatus', enumlabel: 'active' },
      { typname: 'SupplierStatus', enumlabel: 'inactive' },
    ]);
  });
});
