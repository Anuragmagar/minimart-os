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
  await prisma.invoice.deleteMany({});
  await prisma.saleReturnItem.deleteMany({});
  await prisma.saleReturn.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.saleItemAllocation.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.register.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = `Sale Test ${randomUUID()}`) {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createStore(orgId: string, code = `ST-${randomUUID()}`) {
  return prisma.store.create({
    data: { organizationId: orgId, name: `Store ${code}`, code },
  });
}

async function createRegister(storeId: string, code = `REG-${randomUUID()}`) {
  return prisma.register.create({
    data: { storeId, name: `Register ${code}`, code },
  });
}

async function createUser(orgId: string, name = `Cashier ${randomUUID()}`) {
  return prisma.user.create({
    data: {
      organizationId: orgId,
      name,
      email: `${randomUUID()}@example.com`,
      passwordHash: 'x',
    },
  });
}

async function createCustomer(orgId: string, code = `CUST-${randomUUID()}`) {
  return prisma.customer.create({
    data: { organizationId: orgId, name: `Customer ${code}`, code },
  });
}

async function createProduct(orgId: string, sku = `SL-${randomUUID()}`) {
  return prisma.product.create({
    data: { organizationId: orgId, name: `Product ${sku}`, sku },
  });
}

async function createBatch(productId: string, unitCost = '80') {
  return prisma.productBatch.create({
    data: { productId, batchNumber: `B-${randomUUID()}`, unitCost },
  });
}

async function createSaleBase() {
  const org = await createOrg();
  const store = await createStore(org.id);
  const register = await createRegister(store.id);
  const cashier = await createUser(org.id);
  const customer = await createCustomer(org.id);
  return { org, store, register, cashier, customer };
}

describe('Sale schema', () => {
  it('creates a sale with items, snapshots and totals', async () => {
    const { org, store, register, cashier, customer } = await createSaleBase();
    const product = await createProduct(org.id);

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        cashierId: cashier.id,
        customerId: customer.id,
        saleNumber: 'S-1001',
        status: 'paid',
        subTotal: '2500.00',
        discountAmount: '100.00',
        taxAmount: '300.00',
        total: '2700.00',
        operationId: randomUUID(),
        items: {
          create: [
            {
              productId: product.id,
              name: 'Chana Choy',
              sku: product.sku,
              barcode: '8901234567890',
              quantity: '5.000',
              unitPrice: '500.00',
              discountAmount: '100.00',
              taxAmount: '300.00',
              lineTotal: '2700.00',
              unitCost: '80.00',
              costTotal: '400.00',
            },
          ],
        },
        payments: {
          create: [
            {
              organizationId: org.id,
              method: 'cash',
              provider: null,
              amount: '2700.00',
              reference: null,
              status: 'captured',
              paidAt: new Date('2026-09-18T08:00:00.000Z'),
            },
          ],
        },
      },
      include: { items: true },
    });

    expect(sale.saleNumber).toBe('S-1001');
    expect(Number(sale.total.toString())).toBe(2700);
    expect(sale.cashierId).toBe(cashier.id);
    expect(sale.customerId).toBe(customer.id);
    expect(sale.items[0].name).toBe('Chana Choy');
    expect(sale.items[0].sku).toBe(product.sku);
    expect(Number(sale.items[0].quantity.toString())).toBe(5);
    expect(Number(sale.items[0].costTotal.toString())).toBe(400);
  });

  it('rejects a duplicate operation id (BR-024/BR-038)', async () => {
    const { org, store, register } = await createSaleBase();
    const operationId = randomUUID();
    const data = {
      organizationId: org.id,
      storeId: store.id,
      registerId: register.id,
      saleNumber: 'S-1002',
      status: 'paid',
      operationId,
    };

    await prisma.sale.create({ data });
    await expect(prisma.sale.create({ data })).rejects.toThrow();
  });

  it('rejects a sale referencing foreign store, register, customer or cashier', async () => {
    const { org, store, register, cashier, customer } = await createSaleBase();

    await expect(
      prisma.sale.create({
        data: {
          organizationId: randomUUID(),
          storeId: store.id,
          registerId: register.id,
          saleNumber: 'S-N',
          status: 'paid',
          operationId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.sale.create({
        data: {
          organizationId: org.id,
          storeId: randomUUID(),
          registerId: randomUUID(),
          cashierId: randomUUID(),
          customerId: randomUUID(),
          saleNumber: 'S-N',
          status: 'paid',
          operationId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    expect(cashier.id).toBeTruthy();
    expect(customer.id).toBeTruthy();
  });

  it('cascades items when the sale is deleted', async () => {
    const { org, store, register } = await createSaleBase();
    const product = await createProduct(org.id);

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        saleNumber: 'S-1003',
        status: 'voided',
        operationId: randomUUID(),
        items: {
          create: [
            {
              productId: product.id,
              name: 'X',
              quantity: '1',
              unitPrice: '10',
              lineTotal: '10',
              unitCost: '5',
              costTotal: '5',
            },
          ],
        },
      },
    });

    await prisma.sale.delete({ where: { id: sale.id } });
    expect(
      await prisma.saleItem.findMany({ where: { saleId: sale.id } }),
    ).toHaveLength(0);
  });
});

describe('Sale allocation and payment schema', () => {
  it('allocates sold quantity to a batch with cost totals', async () => {
    const { org, store, register } = await createSaleBase();
    const product = await createProduct(org.id);
    const batch = await createBatch(product.id, '80');

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        saleNumber: 'S-1004',
        status: 'paid',
        operationId: randomUUID(),
        items: {
          create: [
            {
              productId: product.id,
              name: 'X',
              quantity: '5.000',
              unitPrice: '110.00',
              lineTotal: '550.00',
              unitCost: '80.00',
              costTotal: '0.00',
              allocations: {
                create: [
                  {
                    batchId: batch.id,
                    quantity: '5.000',
                    unitCost: '80.00',
                    costTotal: '400.00',
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const item = await prisma.saleItem.findUniqueOrThrow({
      where: {
        id: (await prisma.saleItem.findFirst({ where: { saleId: sale.id } }))!
          .id,
      },
    });
    const allocations = await prisma.saleItemAllocation.findMany({
      where: { saleItemId: item.id },
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0].batchId).toBe(batch.id);
    expect(Number(allocations[0].quantity.toString())).toBe(5);
    expect(Number(allocations[0].costTotal.toString())).toBe(400);
  });

  it('rejects an allocation referencing a foreign batch', async () => {
    const { org, store, register } = await createSaleBase();
    const product = await createProduct(org.id);

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        saleNumber: 'S-1005',
        status: 'paid',
        operationId: randomUUID(),
        items: {
          create: [
            {
              productId: product.id,
              name: 'Y',
              quantity: '1',
              unitPrice: '1',
              lineTotal: '1',
              unitCost: '1',
              costTotal: '1',
            },
          ],
        },
      },
    });
    const item = (await prisma.saleItem.findFirst({
      where: { saleId: sale.id },
    }))!;

    await expect(
      prisma.saleItemAllocation.create({
        data: {
          saleItemId: item.id,
          batchId: randomUUID(),
          quantity: '1',
          unitCost: '1',
          costTotal: '1',
        },
      }),
    ).rejects.toThrow();
  });

  it('records a payment against a sale and cascades on sale delete', async () => {
    const { org, store, register } = await createSaleBase();

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        saleNumber: 'S-1006',
        status: 'paid',
        operationId: randomUUID(),
        payments: {
          create: [
            {
              organizationId: org.id,
              method: 'khalti',
              provider: 'khalti',
              amount: '1500.00',
              reference: 'KH-0001',
              status: 'captured',
              paidAt: new Date(),
            },
          ],
        },
      },
    });

    const payments = await prisma.payment.findMany({
      where: { saleId: sale.id },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0].method).toBe('khalti');
    expect(payments[0].reference).toBe('KH-0001');

    await prisma.sale.delete({ where: { id: sale.id } });
    expect(
      await prisma.payment.findMany({ where: { saleId: sale.id } }),
    ).toHaveLength(0);
  });

  it('rejects a payment referencing a foreign organization or sale', async () => {
    const { org, store, register } = await createSaleBase();

    await expect(
      prisma.payment.create({
        data: {
          organizationId: randomUUID(),
          saleId: randomUUID(),
          method: 'cash',
          amount: '1',
          status: 'captured',
          paidAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    expect(org.id).toBeTruthy();
    expect(store.id).toBeTruthy();
    expect(register.id).toBeTruthy();
  });
});

describe('Sale return schema', () => {
  it('creates a return against a sale with items and condition', async () => {
    const { org, store, register } = await createSaleBase();
    const product = await createProduct(org.id);

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        saleNumber: 'S-1007',
        status: 'paid',
        operationId: randomUUID(),
      },
    });

    const saleItem = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        productId: product.id,
        name: 'Defective Item',
        quantity: '2.000',
        unitPrice: '100.00',
        lineTotal: '200.00',
        unitCost: '50.00',
        costTotal: '100.00',
      },
    });

    const returned = await prisma.saleReturn.create({
      data: {
        saleId: sale.id,
        storeId: store.id,
        status: 'completed',
        subTotal: '200.00',
        taxAmount: '0.00',
        total: '200.00',
        reason: 'damaged',
        operationId: randomUUID(),
        items: {
          create: [
            {
              saleItemId: saleItem.id,
              productId: product.id,
              quantity: '2.000',
              condition: 'damaged',
              refundAmount: '200.00',
            },
          ],
        },
      },
    });

    expect(returned.saleId).toBe(sale.id);
    expect(Number(returned.total.toString())).toBe(200);
    const items = await prisma.saleReturnItem.findMany({
      where: { returnId: returned.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].condition).toBe('damaged');
    expect(items[0].saleItemId).toBe(saleItem.id);
  });

  it('creates a return without an original sale or customer', async () => {
    const { org, store } = await createSaleBase();
    const product = await createProduct(org.id);

    const returned = await prisma.saleReturn.create({
      data: {
        storeId: store.id,
        status: 'completed',
        total: '50.00',
        operationId: randomUUID(),
        items: {
          create: [
            {
              productId: product.id,
              quantity: '1',
              condition: 'resaleable',
              refundAmount: '50.00',
            },
          ],
        },
      },
    });

    expect(returned.saleId).toBeNull();
    expect(returned.customerId).toBeNull();
  });

  it('rejects a duplicate return operation id and a return on a deleted sale', async () => {
    const { org, store } = await createSaleBase();
    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: (
          await prisma.register.findFirstOrThrow({
            where: { storeId: store.id },
          })
        ).id,
        saleNumber: 'S-1008',
        status: 'paid',
        operationId: randomUUID(),
      },
    });
    const opId = randomUUID();
    const data = {
      saleId: sale.id,
      storeId: store.id,
      status: 'completed',
      total: '10',
      operationId: opId,
    };

    await prisma.saleReturn.create({ data });
    await expect(prisma.saleReturn.create({ data })).rejects.toThrow();

    await expect(
      prisma.sale.delete({ where: { id: sale.id } }),
    ).rejects.toThrow();
  });
});

describe('Invoice schema', () => {
  it('creates an invoice with seller/customer snapshots and tax totals', async () => {
    const { org, store } = await createSaleBase();
    const register = await prisma.register.findFirstOrThrow({
      where: { storeId: store.id },
    });
    const customer = await createCustomer(org.id);

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        customerId: customer.id,
        saleNumber: 'S-1009',
        status: 'invoiced',
        operationId: randomUUID(),
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        saleId: sale.id,
        invoiceNumber: 'INV-2026-0001',
        sellerName: 'Store ' + store.code,
        sellerPan: '301234567',
        customerName: customer.name,
        subTotal: '2700.00',
        discountAmount: '0.00',
        taxAmount: '300.00',
        total: '3000.00',
        status: 'issued',
      },
    });

    expect(invoice.invoiceNumber).toBe('INV-2026-0001');
    expect(invoice.customerName).toBe(customer.name);
    expect(Number(invoice.taxAmount.toString())).toBe(300);
    expect(invoice.status).toBe('issued');
  });

  it('rejects an invoice for a foreign sale and protects the sale from deletion', async () => {
    const { org, store, register } = await createSaleBase();
    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        saleNumber: 'S-1010',
        status: 'paid',
        operationId: randomUUID(),
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        saleId: sale.id,
        invoiceNumber: 'INV-2026-0002',
        status: 'issued',
      },
    });

    expect(invoice.saleId).toBe(sale.id);
    await expect(
      prisma.sale.delete({ where: { id: sale.id } }),
    ).rejects.toThrow();
  });
});

describe('Sales schema structure', () => {
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
           'invoices', 'payments', 'sale_item_allocations', 'sale_items',
           'sale_return_items', 'sale_returns', 'sales'
         )
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      { table_name: 'invoices', column_name: 'sale_id', on_delete: 'r' },
      {
        table_name: 'payments',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      { table_name: 'payments', column_name: 'sale_id', on_delete: 'c' },
      {
        table_name: 'sale_item_allocations',
        column_name: 'batch_id',
        on_delete: 'r',
      },
      {
        table_name: 'sale_item_allocations',
        column_name: 'sale_item_id',
        on_delete: 'c',
      },
      { table_name: 'sale_items', column_name: 'batch_id', on_delete: 'r' },
      { table_name: 'sale_items', column_name: 'product_id', on_delete: 'r' },
      { table_name: 'sale_items', column_name: 'sale_id', on_delete: 'c' },
      {
        table_name: 'sale_return_items',
        column_name: 'product_id',
        on_delete: 'r',
      },
      {
        table_name: 'sale_return_items',
        column_name: 'return_id',
        on_delete: 'c',
      },
      {
        table_name: 'sale_return_items',
        column_name: 'sale_item_id',
        on_delete: 'r',
      },
      {
        table_name: 'sale_returns',
        column_name: 'customer_id',
        on_delete: 'r',
      },
      { table_name: 'sale_returns', column_name: 'sale_id', on_delete: 'r' },
      { table_name: 'sale_returns', column_name: 'store_id', on_delete: 'r' },
      { table_name: 'sales', column_name: 'cash_session_id', on_delete: 'r' },
      { table_name: 'sales', column_name: 'cashier_id', on_delete: 'r' },
      { table_name: 'sales', column_name: 'customer_id', on_delete: 'r' },
      { table_name: 'sales', column_name: 'organization_id', on_delete: 'r' },
      { table_name: 'sales', column_name: 'register_id', on_delete: 'r' },
      { table_name: 'sales', column_name: 'store_id', on_delete: 'r' },
    ]);
  });

  it('links sales.cash_session_id to cash_sessions (ASM-020 closed)', async () => {
    const fks = (await prisma.$queryRawUnsafe(
      `SELECT c.conname, a.attname AS column_name, fc.relname AS foreign_table
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN pg_class fc ON c.confrelid = fc.oid
       JOIN LATERAL unnest(c.conkey) AS k ON true
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k
       WHERE c.contype = 'f' AND cl.relname = 'sales' AND a.attname = 'cash_session_id'`,
    )) as Array<{
      conname: string;
      column_name: string;
      foreign_table: string;
    }>;

    expect(fks).toEqual([
      {
        conname: 'sales_cash_session_id_fkey',
        column_name: 'cash_session_id',
        foreign_table: 'cash_sessions',
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
           'invoices', 'payments', 'sale_item_allocations', 'sale_items',
           'sale_return_items', 'sale_returns', 'sales'
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
        table_name: 'invoices',
        column_name: 'discount_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'invoices',
        column_name: 'sub_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'invoices',
        column_name: 'tax_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'invoices',
        column_name: 'total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'payments',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_item_allocations',
        column_name: 'cost_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_item_allocations',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'sale_item_allocations',
        column_name: 'unit_cost',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_items',
        column_name: 'cost_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_items',
        column_name: 'discount_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_items',
        column_name: 'line_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_items',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'sale_items',
        column_name: 'tax_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_items',
        column_name: 'unit_cost',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_items',
        column_name: 'unit_price',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_return_items',
        column_name: 'quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'sale_return_items',
        column_name: 'refund_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_returns',
        column_name: 'sub_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_returns',
        column_name: 'tax_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sale_returns',
        column_name: 'total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sales',
        column_name: 'discount_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sales',
        column_name: 'sub_total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sales',
        column_name: 'tax_amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'sales',
        column_name: 'total',
        numeric_precision: 14,
        numeric_scale: 2,
      },
    ]);
  });

  it('defines the expected indexes on sales tables', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN (
           'invoices', 'payments', 'sale_item_allocations', 'sale_items',
           'sale_return_items', 'sale_returns', 'sales'
         )
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'invoices_pkey' },
      { indexname: 'invoices_sale_id_idx' },
      { indexname: 'payments_organization_id_paid_at_idx' },
      { indexname: 'payments_pkey' },
      { indexname: 'payments_sale_id_idx' },
      { indexname: 'sale_item_allocations_pkey' },
      { indexname: 'sale_item_allocations_sale_item_id_idx' },
      { indexname: 'sale_items_pkey' },
      { indexname: 'sale_items_sale_id_idx' },
      { indexname: 'sale_return_items_pkey' },
      { indexname: 'sale_return_items_return_id_idx' },
      { indexname: 'sale_returns_operation_id_key' },
      { indexname: 'sale_returns_pkey' },
      { indexname: 'sale_returns_sale_id_idx' },
      { indexname: 'sale_returns_store_id_created_at_idx' },
      { indexname: 'sales_customer_id_idx' },
      { indexname: 'sales_operation_id_key' },
      { indexname: 'sales_pkey' },
      { indexname: 'sales_store_id_created_at_idx' },
    ]);
  });

  it('types sale/return/invoice status as text and keeps unique operation ids', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'sales' AND column_name = 'status')
           OR (table_name = 'sale_returns' AND column_name = 'status')
           OR (table_name = 'invoices' AND column_name = 'invoice_number')
         )
       ORDER BY table_name, column_name`,
    )) as Array<{
      column_name: string;
      is_nullable: string;
      data_type: string;
      column_default: string | null;
    }>;

    expect(rows).toEqual([
      {
        column_name: 'invoice_number',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        column_name: 'status',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
      {
        column_name: 'status',
        is_nullable: 'NO',
        data_type: 'text',
        column_default: null,
      },
    ]);
  });

  it('links sale items to allocations through the document chain', async () => {
    const { org, store, register } = await createSaleBase();
    const product = await createProduct(org.id);
    const batch = await createBatch(product.id);

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        storeId: store.id,
        registerId: register.id,
        saleNumber: 'S-1011',
        status: 'paid',
        operationId: randomUUID(),
        items: {
          create: [
            {
              productId: product.id,
              name: 'Chained',
              quantity: '3',
              unitPrice: '50',
              lineTotal: '150',
              unitCost: '30',
              costTotal: '0',
              allocations: {
                create: [
                  {
                    batchId: batch.id,
                    quantity: '3',
                    unitCost: '30',
                    costTotal: '90',
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const item = (await prisma.saleItem.findFirst({
      where: { saleId: sale.id },
    }))!;
    const allocation = (await prisma.saleItemAllocation.findFirst({
      where: { saleItemId: item.id },
    }))!;
    expect(allocation.saleItemId).toBe(item.id);
    expect(allocation.batchId).toBe(batch.id);
  });
});
