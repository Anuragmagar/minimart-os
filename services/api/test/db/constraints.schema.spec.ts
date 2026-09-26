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
  await prisma.inventoryBalance.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.inventoryLocation.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = `Constraints Test ${randomUUID()}`) {
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

async function createProduct(orgId: string, sku = `CON-${randomUUID()}`) {
  return prisma.product.create({
    data: { organizationId: orgId, name: `Product ${sku}`, sku },
  });
}

describe('FK-child index coverage (01.12)', () => {
  it('indexes every CASCADE parent column so parent deletes are indexed', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'categories_parent_id_idx',
           'user_roles_role_id_idx',
           'role_permissions_permission_id_idx',
           'unit_conversions_to_unit_id_idx',
           'product_barcodes_product_id_idx',
           'purchase_order_items_purchase_order_id_idx',
           'goods_receipt_items_receipt_id_idx',
           'sale_items_sale_id_idx',
           'sale_item_allocations_sale_item_id_idx',
           'sale_return_items_return_id_idx'
         )
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows.map((r) => r.indexname)).toEqual([
      'categories_parent_id_idx',
      'goods_receipt_items_receipt_id_idx',
      'product_barcodes_product_id_idx',
      'purchase_order_items_purchase_order_id_idx',
      'role_permissions_permission_id_idx',
      'sale_item_allocations_sale_item_id_idx',
      'sale_items_sale_id_idx',
      'sale_return_items_return_id_idx',
      'unit_conversions_to_unit_id_idx',
      'user_roles_role_id_idx',
    ]);
  });
});

describe('InventoryBalance projection integrity (BR-006)', () => {
  it('allows exactly one balance row per (location, product, batch)', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const productA = await createProduct(org.id);
    const productB = await createProduct(org.id);

    await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: productA.id,
        quantityOnHand: '10',
      },
    });
    await expect(
      prisma.inventoryBalance.create({
        data: {
          locationId: location.id,
          productId: productA.id,
          quantityOnHand: '1',
        },
      }),
    ).rejects.toThrow();

    const otherProduct = await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: productB.id,
        quantityOnHand: '1',
      },
    });
    expect(otherProduct.productId).toBe(productB.id);
  });

  it('distinguishes the unbatchable line from batch-level lines', async () => {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);
    const batch = await prisma.productBatch.create({
      data: { productId: product.id, batchNumber: 'CON-B1', unitCost: '10' },
    });

    await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: product.id,
        quantityOnHand: '5',
      },
    });
    await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: product.id,
        batchId: batch.id,
        quantityOnHand: '20',
      },
    });
    await expect(
      prisma.inventoryBalance.create({
        data: {
          locationId: location.id,
          productId: product.id,
          batchId: batch.id,
          quantityOnHand: '30',
        },
      }),
    ).rejects.toThrow();

    const rows = await prisma.inventoryBalance.findMany({
      where: { locationId: location.id, productId: product.id },
    });
    expect(rows).toHaveLength(2);
  });

  it('enforces the NULL-safe projection unique index with COALESCE', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'inventory_balances_location_product_batch_key'`,
    )) as Array<{ indexname: string; indexdef: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE');
    expect(rows[0].indexdef).toContain('batch_id');
    expect(rows[0].indexdef).toContain('00000000-0000-0000-0000-000000000000');
  });
});

describe('Negative stock disabled (BR-016)', () => {
  async function createBalanceBase() {
    const org = await createOrg();
    const store = await createStore(org.id);
    const location = await createLocation(store.id);
    const product = await createProduct(org.id);
    return { location, product };
  }

  it('rejects a negative quantity on hand', async () => {
    const { location, product } = await createBalanceBase();
    await expect(
      prisma.inventoryBalance.create({
        data: {
          locationId: location.id,
          productId: product.id,
          quantityOnHand: '-1',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a negative reserved quantity', async () => {
    const { location, product } = await createBalanceBase();
    await expect(
      prisma.inventoryBalance.create({
        data: {
          locationId: location.id,
          productId: product.id,
          quantityOnHand: '5',
          reserved: '-2',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a negative available quantity', async () => {
    const { location, product } = await createBalanceBase();
    await expect(
      prisma.inventoryBalance.create({
        data: {
          locationId: location.id,
          productId: product.id,
          quantityOnHand: '5',
          available: '-1',
        },
      }),
    ).rejects.toThrow();
  });

  it('accepts zero quantities and rejects negative updates', async () => {
    const { location, product } = await createBalanceBase();
    const balance = await prisma.inventoryBalance.create({
      data: {
        locationId: location.id,
        productId: product.id,
        quantityOnHand: '0',
        reserved: '0',
        available: '0',
      },
    });

    expect(Number(balance.quantityOnHand.toString())).toBe(0);
    await expect(
      prisma.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantityOnHand: '-3' },
      }),
    ).rejects.toThrow();
  });

  it('defines a validated non-negative CHECK on inventory_balances', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT conname, contype::text AS contype, convalidated
       FROM pg_constraint
       WHERE conrelid = 'inventory_balances'::regclass
           AND conname = 'inventory_balances_non_negative'`,
    )) as Array<{ conname: string; contype: string; convalidated: boolean }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].contype).toBe('c');
    expect(rows[0].convalidated).toBe(true);

    const full = (await prisma.$queryRawUnsafe(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = 'inventory_balances'::regclass
           AND conname = 'inventory_balances_non_negative'`,
    )) as Array<{ def: string }>;

    expect(full[0].def).toContain('quantity_on_hand');
    expect(full[0].def).toContain('reserved');
    expect(full[0].def).toContain('available');
    expect(full[0].def).toContain('(0)::numeric');
  });
});
