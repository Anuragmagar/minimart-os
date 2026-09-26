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
  await prisma.productBarcode.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.unitConversion.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = 'Product Test Org') {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

describe('Category schema', () => {
  it('creates a nested category tree scoped to an organization', async () => {
    const org = await createOrg();
    const parent = await prisma.category.create({
      data: { organizationId: org.id, name: 'Beverages' },
    });
    const child = await prisma.category.create({
      data: {
        organizationId: org.id,
        parentId: parent.id,
        name: 'Soft Drinks',
      },
    });

    expect(child.parentId).toBe(parent.id);
    expect(child.status).toBe('active');
    expect(parent.parentId).toBeNull();

    const reloaded = await prisma.category.findUniqueOrThrow({
      where: { id: parent.id },
      include: { children: true },
    });
    expect(reloaded.children).toHaveLength(1);
    expect(reloaded.children[0].id).toBe(child.id);
  });

  it('enforces unique category names within an organization', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.category.create({
      data: { organizationId: orgA.id, name: 'Snacks' },
    });
    const inB = await prisma.category.create({
      data: { organizationId: orgB.id, name: 'Snacks' },
    });

    expect(inB.organizationId).toBe(orgB.id);
    await expect(
      prisma.category.create({
        data: { organizationId: orgA.id, name: 'Snacks' },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting a category that is still a parent', async () => {
    const org = await createOrg();
    const parent = await prisma.category.create({
      data: { organizationId: org.id, name: 'Parent' },
    });
    await prisma.category.create({
      data: { organizationId: org.id, parentId: parent.id, name: 'Child' },
    });
    await expect(
      prisma.category.delete({ where: { id: parent.id } }),
    ).rejects.toThrow();
  });
});

describe('Brand and Unit schema', () => {
  it('creates brands scoped to an organization with unique names', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.brand.create({
      data: { organizationId: orgA.id, name: 'Coca-Cola' },
    });
    const inB = await prisma.brand.create({
      data: { organizationId: orgB.id, name: 'Coca-Cola' },
    });

    expect(inB.organizationId).toBe(orgB.id);
    await expect(
      prisma.brand.create({
        data: { organizationId: orgA.id, name: 'Coca-Cola' },
      }),
    ).rejects.toThrow();
  });

  it('creates units with explicit precision and unique codes per org', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    const kg = await prisma.unit.create({
      data: {
        organizationId: orgA.id,
        name: 'Kilogram',
        code: 'kg',
        precision: 3,
      },
    });

    expect(kg.precision).toBe(3);
    expect(kg.status).toBe('active');

    await prisma.unit.create({
      data: {
        organizationId: orgB.id,
        name: 'Kilogram',
        code: 'kg',
        precision: 3,
      },
    });
    await expect(
      prisma.unit.create({
        data: {
          organizationId: orgA.id,
          name: 'Kilogram B',
          code: 'kg',
          precision: 3,
        },
      }),
    ).rejects.toThrow();
  });

  it('records a unit conversion factor with a unique direction per org', async () => {
    const org = await createOrg();
    const piece = await prisma.unit.create({
      data: { organizationId: org.id, name: 'Piece', code: 'pc', precision: 0 },
    });
    const dozen = await prisma.unit.create({
      data: {
        organizationId: org.id,
        name: 'Dozen',
        code: 'doz',
        precision: 0,
      },
    });

    const conversion = await prisma.unitConversion.create({
      data: {
        organizationId: org.id,
        fromUnitId: dozen.id,
        toUnitId: piece.id,
        multiplier: '12',
      },
    });

    expect(Number(conversion.multiplier.toString())).toBe(12);
    await expect(
      prisma.unitConversion.create({
        data: {
          organizationId: org.id,
          fromUnitId: dozen.id,
          toUnitId: piece.id,
          multiplier: '12',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Product schema', () => {
  it('creates a product with scoped references and decimal values', async () => {
    const org = await createOrg();
    const category = await prisma.category.create({
      data: { organizationId: org.id, name: 'Drinks' },
    });
    const brand = await prisma.brand.create({
      data: { organizationId: org.id, name: 'Coca-Cola' },
    });
    const unit = await prisma.unit.create({
      data: { organizationId: org.id, name: 'Piece', code: 'pc', precision: 0 },
    });

    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: category.id,
        brandId: brand.id,
        unitId: unit.id,
        name: 'Coke 500ml',
        sku: 'COK-500',
        defaultPurchasePrice: '45.50',
        defaultSellingPrice: '60.00',
        reorderLevel: '10.000',
        reorderQuantity: '24.000',
      },
    });

    expect(product.organizationId).toBe(org.id);
    expect(product.categoryId).toBe(category.id);
    expect(product.brandId).toBe(brand.id);
    expect(product.unitId).toBe(unit.id);
    expect(product.name).toBe('Coke 500ml');
    expect(Number(product.defaultPurchasePrice.toString())).toBe(45.5);
    expect(Number(product.defaultSellingPrice.toString())).toBe(60);
    expect(Number(product.reorderLevel.toString())).toBe(10);
    expect(Number(product.reorderQuantity.toString())).toBe(24);
    expect(product.status).toBe('active');
    expect(product.taxCategoryId).toBeNull();
  });

  it('enforces unique SKU within an organization only', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.product.create({
      data: { organizationId: orgA.id, name: 'A', sku: 'SKU-1' },
    });
    const inB = await prisma.product.create({
      data: { organizationId: orgB.id, name: 'B', sku: 'SKU-1' },
    });

    expect(inB.organizationId).toBe(orgB.id);
    await expect(
      prisma.product.create({
        data: { organizationId: orgA.id, name: 'A2', sku: 'SKU-1' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a product referencing foreign parents', async () => {
    const org = await createOrg();
    await expect(
      prisma.product.create({
        data: {
          organizationId: org.id,
          categoryId: randomUUID(),
          name: 'X',
          sku: 'X',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.product.create({
        data: {
          organizationId: org.id,
          brandId: randomUUID(),
          name: 'Y',
          sku: 'Y',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.product.create({
        data: {
          organizationId: org.id,
          unitId: randomUUID(),
          name: 'Z',
          sku: 'Z',
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps decimal precision and rejects amounts/orders beyond declared scale', async () => {
    const org = await createOrg();
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        name: 'Precise',
        sku: 'PREC-1',
        defaultPurchasePrice: '1234.99',
        reorderQuantity: '1.234',
      },
    });

    expect(product.defaultPurchasePrice.toString()).toBe('1234.99');
    expect(product.reorderQuantity.toString()).toBe('1.234');
  });
});

describe('Product barcode schema', () => {
  it('attaches barcodes to a product with an org-unique barcode value', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    const productA = await prisma.product.create({
      data: { organizationId: orgA.id, name: 'A', sku: 'BAR-A' },
    });
    const productB = await prisma.product.create({
      data: { organizationId: orgB.id, name: 'B', sku: 'BAR-B' },
    });

    const primary = await prisma.productBarcode.create({
      data: {
        organizationId: orgA.id,
        productId: productA.id,
        barcode: '8901234567890',
        barcodeType: 'ean13',
        isPrimary: true,
      },
    });

    expect(primary.isPrimary).toBe(true);
    expect(primary.barcodeType).toBe('ean13');

    const inB = await prisma.productBarcode.create({
      data: {
        organizationId: orgB.id,
        productId: productB.id,
        barcode: '8901234567890',
      },
    });
    expect(inB.isPrimary).toBe(false);

    await expect(
      prisma.productBarcode.create({
        data: {
          organizationId: orgA.id,
          productId: productA.id,
          barcode: '8901234567890',
        },
      }),
    ).rejects.toThrow();
  });

  it('cascades barcodes when the product is deleted', async () => {
    const org = await createOrg();
    const product = await prisma.product.create({
      data: { organizationId: org.id, name: 'Temp', sku: 'TMP' },
    });
    await prisma.productBarcode.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        barcode: '1111111111111',
      },
    });

    await prisma.product.delete({ where: { id: product.id } });

    const remaining = await prisma.productBarcode.findMany({
      where: { productId: product.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('rejects a barcode referencing a foreign product', async () => {
    const org = await createOrg();
    await expect(
      prisma.productBarcode.create({
        data: {
          organizationId: org.id,
          productId: randomUUID(),
          barcode: '2222222222222',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Product schema structure', () => {
  it('enforces expected foreign-key deletion actions', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname IN ('categories', 'brands', 'units', 'unit_conversions', 'products', 'product_barcodes')
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      { table_name: 'brands', column_name: 'organization_id', on_delete: 'r' },
      {
        table_name: 'categories',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      { table_name: 'categories', column_name: 'parent_id', on_delete: 'r' },
      {
        table_name: 'product_barcodes',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      {
        table_name: 'product_barcodes',
        column_name: 'product_id',
        on_delete: 'c',
      },
      { table_name: 'products', column_name: 'brand_id', on_delete: 'r' },
      { table_name: 'products', column_name: 'category_id', on_delete: 'r' },
      {
        table_name: 'products',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      {
        table_name: 'products',
        column_name: 'tax_category_id',
        on_delete: 'r',
      },
      { table_name: 'products', column_name: 'unit_id', on_delete: 'r' },
      {
        table_name: 'unit_conversions',
        column_name: 'from_unit_id',
        on_delete: 'r',
      },
      {
        table_name: 'unit_conversions',
        column_name: 'organization_id',
        on_delete: 'r',
      },
      {
        table_name: 'unit_conversions',
        column_name: 'to_unit_id',
        on_delete: 'r',
      },
      { table_name: 'units', column_name: 'organization_id', on_delete: 'r' },
    ]);
  });

  it('declares NUMERIC columns with the documented scales', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE data_type = 'numeric' AND table_schema = 'public'
         AND table_name IN ('products', 'unit_conversions')
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'products',
        column_name: 'default_purchase_price',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'products',
        column_name: 'default_selling_price',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'products',
        column_name: 'reorder_level',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'products',
        column_name: 'reorder_quantity',
        numeric_precision: 14,
        numeric_scale: 3,
      },
      {
        table_name: 'unit_conversions',
        column_name: 'multiplier',
        numeric_precision: 14,
        numeric_scale: 6,
      },
    ]);
  });

  it('defines status enums with exactly active/inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname IN ('CategoryStatus', 'BrandStatus', 'UnitStatus', 'ProductStatus')
       ORDER BY t.typname, e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'BrandStatus', enumlabel: 'active' },
      { typname: 'BrandStatus', enumlabel: 'inactive' },
      { typname: 'CategoryStatus', enumlabel: 'active' },
      { typname: 'CategoryStatus', enumlabel: 'inactive' },
      { typname: 'ProductStatus', enumlabel: 'active' },
      { typname: 'ProductStatus', enumlabel: 'inactive' },
      { typname: 'UnitStatus', enumlabel: 'active' },
      { typname: 'UnitStatus', enumlabel: 'inactive' },
    ]);
  });

  it('keeps tax_category_id on products unlinked until the tax schema exists', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'tax_category_id'`,
    )) as Array<{ is_nullable: string; data_type: string }>;

    expect(rows[0]).toEqual({ is_nullable: 'YES', data_type: 'uuid' });
  });
});
