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
  await prisma.productPrice.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.taxCategory.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

async function createOrg(name = 'Pricing Tax Test Org') {
  return prisma.organization.create({
    data: { name, legalName: `${name} Pvt Ltd`, currency: 'NPR' },
  });
}

async function createProduct(orgId: string, sku = `MK-${randomUUID()}`) {
  return prisma.product.create({
    data: { organizationId: orgId, name: `Product ${sku}`, sku },
  });
}

describe('TaxCategory schema', () => {
  it('creates a tax category with a decimal rate and defaults', async () => {
    const org = await createOrg();
    const tax = await prisma.taxCategory.create({
      data: {
        organizationId: org.id,
        name: 'VAT',
        code: 'VAT',
        rate: '13.0000',
        taxType: 'percent',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    expect(tax.organizationId).toBe(org.id);
    expect(Number(tax.rate.toString())).toBe(13);
    expect(tax.taxType).toBe('percent');
    expect(tax.status).toBe('active');
    expect(tax.effectiveTo).toBeNull();
    expect(tax.effectiveFrom.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('preserves a fractional rate up to 4 decimal places', async () => {
    const org = await createOrg();
    const tax = await prisma.taxCategory.create({
      data: {
        organizationId: org.id,
        name: 'Service Charge',
        code: 'SC',
        rate: '5.1234',
        taxType: 'percent',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    expect(tax.rate.toString()).toBe('5.1234');
  });

  it('enforces unique tax category codes within an organization', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    await prisma.taxCategory.create({
      data: {
        organizationId: orgA.id,
        name: 'VAT',
        code: 'VAT',
        rate: '13',
        taxType: 'percent',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const inB = await prisma.taxCategory.create({
      data: {
        organizationId: orgB.id,
        name: 'VAT',
        code: 'VAT',
        rate: '13',
        taxType: 'percent',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    expect(inB.organizationId).toBe(orgB.id);

    await expect(
      prisma.taxCategory.create({
        data: {
          organizationId: orgA.id,
          name: 'VAT',
          code: 'VAT',
          rate: '13',
          taxType: 'percent',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('links products to a tax category via tax_category_id', async () => {
    const org = await createOrg();
    const product = await createProduct(org.id);
    const tax = await prisma.taxCategory.create({
      data: {
        organizationId: org.id,
        name: 'VAT',
        code: 'VAT',
        rate: '13',
        taxType: 'percent',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { taxCategoryId: tax.id },
    });
    expect(updated.taxCategoryId).toBe(tax.id);

    const reloaded = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { taxCategory: true },
    });
    expect(reloaded.taxCategory?.code).toBe('VAT');
  });

  it('blocks a product from referencing a foreign tax category', async () => {
    const org = await createOrg();
    const product = await createProduct(org.id);
    await expect(
      prisma.product.update({
        where: { id: product.id },
        data: { taxCategoryId: randomUUID() },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting a tax category still referenced by a product', async () => {
    const org = await createOrg();
    const tax = await prisma.taxCategory.create({
      data: {
        organizationId: org.id,
        name: 'VAT',
        code: 'VAT',
        rate: '13',
        taxType: 'percent',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.product.create({
      data: {
        organizationId: org.id,
        taxCategoryId: tax.id,
        name: 'Linked',
        sku: 'LINKED',
      },
    });

    await expect(
      prisma.taxCategory.delete({ where: { id: tax.id } }),
    ).rejects.toThrow();
  });
});

describe('ProductPrice schema', () => {
  it('records multiple price periods for one product', async () => {
    const org = await createOrg();
    const product = await createProduct(org.id);

    const oldPrice = await prisma.productPrice.create({
      data: {
        productId: product.id,
        priceType: 'retail',
        amount: '55.00',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-06-30T00:00:00.000Z'),
      },
    });
    const newPrice = await prisma.productPrice.create({
      data: {
        productId: product.id,
        priceType: 'retail',
        amount: '60.00',
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
      },
    });

    expect(Number(oldPrice.amount.toString())).toBe(55);
    expect(Number(newPrice.amount.toString())).toBe(60);
    expect(oldPrice.effectiveTo?.toISOString()).toBe(
      '2026-06-30T00:00:00.000Z',
    );
    expect(newPrice.effectiveTo).toBeNull();

    const prices = await prisma.productPrice.findMany({
      where: { productId: product.id },
      orderBy: { effectiveFrom: 'asc' },
    });
    expect(prices).toHaveLength(2);
  });

  it('keeps price history scoped to a product and blocks foreign products', async () => {
    const org = await createOrg();
    const product = await createProduct(org.id);
    await expect(
      prisma.productPrice.create({
        data: {
          productId: randomUUID(),
          priceType: 'retail',
          amount: '10.00',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();

    const prices = await prisma.productPrice.findMany({
      where: { productId: product.id },
    });
    expect(prices).toHaveLength(0);
  });

  it('prevents deleting a product that has price history', async () => {
    const org = await createOrg();
    const product = await createProduct(org.id);
    await prisma.productPrice.create({
      data: {
        productId: product.id,
        priceType: 'wholesale',
        amount: '40.00',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    await expect(
      prisma.product.delete({ where: { id: product.id } }),
    ).rejects.toThrow();
  });
});

describe('Pricing and tax schema structure', () => {
  it('enforces expected foreign-key deletion actions', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT cl.relname AS table_name, a.attname AS column_name, c.confdeltype::text AS on_delete
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         ON k.attnum = ANY(c.conkey)
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND cl.relname IN ('products', 'tax_categories', 'product_prices')
       ORDER BY cl.relname, a.attname`,
    )) as Array<{ table_name: string; column_name: string; on_delete: string }>;

    expect(rows).toEqual([
      {
        table_name: 'product_prices',
        column_name: 'product_id',
        on_delete: 'r',
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
        table_name: 'tax_categories',
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
         AND table_name IN ('product_prices', 'tax_categories')
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'product_prices',
        column_name: 'amount',
        numeric_precision: 14,
        numeric_scale: 2,
      },
      {
        table_name: 'tax_categories',
        column_name: 'rate',
        numeric_precision: 14,
        numeric_scale: 4,
      },
    ]);
  });

  it('defines the expected indexes on pricing and tax tables', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('tax_categories', 'product_prices')
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;

    expect(rows).toEqual([
      { indexname: 'product_prices_pkey' },
      { indexname: 'product_prices_product_id_price_type_effective_from_idx' },
      { indexname: 'tax_categories_organization_id_code_key' },
      { indexname: 'tax_categories_pkey' },
    ]);
  });

  it('keeps amount/price_type/effective windows on prices and tax_type optional in the right places', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'product_prices' AND column_name IN ('price_type', 'effective_from', 'effective_to'))
           OR (table_name = 'tax_categories' AND column_name IN ('tax_type', 'effective_from', 'effective_to', 'status'))
         )
       ORDER BY table_name, column_name`,
    )) as Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
      udt_name: string;
    }>;

    expect(rows).toEqual([
      {
        table_name: 'product_prices',
        column_name: 'effective_from',
        is_nullable: 'NO',
        data_type: 'timestamp with time zone',
        udt_name: 'timestamptz',
      },
      {
        table_name: 'product_prices',
        column_name: 'effective_to',
        is_nullable: 'YES',
        data_type: 'timestamp with time zone',
        udt_name: 'timestamptz',
      },
      {
        table_name: 'product_prices',
        column_name: 'price_type',
        is_nullable: 'NO',
        data_type: 'text',
        udt_name: 'text',
      },
      {
        table_name: 'tax_categories',
        column_name: 'effective_from',
        is_nullable: 'NO',
        data_type: 'timestamp with time zone',
        udt_name: 'timestamptz',
      },
      {
        table_name: 'tax_categories',
        column_name: 'effective_to',
        is_nullable: 'YES',
        data_type: 'timestamp with time zone',
        udt_name: 'timestamptz',
      },
      {
        table_name: 'tax_categories',
        column_name: 'status',
        is_nullable: 'NO',
        data_type: 'USER-DEFINED',
        udt_name: 'TaxCategoryStatus',
      },
      {
        table_name: 'tax_categories',
        column_name: 'tax_type',
        is_nullable: 'NO',
        data_type: 'text',
        udt_name: 'text',
      },
    ]);
  });

  it('defines TaxCategoryStatus with exactly active and inactive labels', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname = 'TaxCategoryStatus'
       ORDER BY e.enumsortorder`,
    )) as Array<{ typname: string; enumlabel: string }>;

    expect(rows).toEqual([
      { typname: 'TaxCategoryStatus', enumlabel: 'active' },
      { typname: 'TaxCategoryStatus', enumlabel: 'inactive' },
    ]);
  });
});
