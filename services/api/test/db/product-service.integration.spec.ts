import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  PrismaService,
  PrismaTx,
} from '../../src/database/prisma.service.js';
import type { TenantContext } from '../../src/common/auth/authenticated-user.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import { PrismaProductRepository } from '../../src/products/prisma-product.repository.js';
import { PrismaCategoryRepository } from '../../src/categories/prisma-category.repository.js';
import { PrismaBrandRepository } from '../../src/brands/prisma-brand.repository.js';
import { PrismaUnitRepository } from '../../src/units/prisma-unit.repository.js';
import { PrismaTaxCategoryRepository } from '../../src/tax-categories/prisma-tax-category.repository.js';
import { ProductService } from '../../src/products/product.service.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;
let prismaService: PrismaService;
let productService: ProductService;
let auditService: AuditService;
let auditRepository: PrismaAuditRepository;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string };
let ctxA: TenantContext;
let ctxB: TenantContext;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  // The repositories reach the database through PrismaService rather than a
  // raw client, and the delete guard needs a real transaction, so the service
  // is assembled by hand over a genuine `$transaction`.
  prismaService = {
    client: prisma,
    runInTransaction: <T>(fn: (tx: PrismaTx) => Promise<T>) =>
      prisma.$transaction((tx) => fn(tx as unknown as PrismaTx)),
  } as unknown as PrismaService;

  auditRepository = new PrismaAuditRepository(prismaService);
  auditService = new AuditService(auditRepository);
  productService = new ProductService(
    new PrismaProductRepository(prismaService),
    new PrismaCategoryRepository(prismaService),
    new PrismaBrandRepository(prismaService),
    new PrismaUnitRepository(prismaService),
    new PrismaTaxCategoryRepository(prismaService),
    prismaService,
    auditService,
  );

  orgA = await prisma.organization.create({
    data: {
      name: 'Product Svc Org A',
      legalName: 'A Pvt Ltd',
      currency: 'NPR',
    },
  });
  orgB = await prisma.organization.create({
    data: {
      name: 'Product Svc Org B',
      legalName: 'B Pvt Ltd',
      currency: 'NPR',
    },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: orgA.id,
      email: 'product-service@example.com',
      passwordHash: 'not-a-real-hash',
      name: 'Product Service Tester',
    },
  });
  userA = { id: user.id };
  ctxA = {
    organizationId: orgA.id,
    userId: user.id,
    storeId: null,
    permissions: [],
  };
  ctxB = {
    organizationId: orgB.id,
    userId: user.id,
    storeId: null,
    permissions: [],
  };
});

afterAll(async () => {
  if (!prisma) {
    return;
  }
  await prisma.auditLog.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.productBarcode.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

function suffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function makeProduct(
  ctx: TenantContext,
  overrides: Record<string, unknown> = {},
) {
  const s = suffix();
  return (await productService.create(ctx, {
    name: `Product ${s}`,
    sku: `SKU-${s}`,
    ...overrides,
  } as never)) as { id: string; sku: string; status: string };
}

describe('ProductService against PostgreSQL', () => {
  it('creates a product inside the caller organization and audits it', async () => {
    const created = await makeProduct(ctxA, {
      defaultPurchasePrice: '45.50',
      defaultSellingPrice: '0.1',
      reorderLevel: '10.000',
      reorderQuantity: '24.000',
    });

    const stored = await prisma.product.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.organizationId).toBe(orgA.id);
    expect(stored.status).toBe('active');

    // 0.1 has no exact binary form, so this asserts the column kept the exact
    // decimal rather than the double a float round trip would have lost.
    // Prisma's Decimal normalizes away trailing zeros, so the scale of the
    // stored column is not visible in toString().
    expect(stored.defaultSellingPrice.toString()).toBe('0.1');
    expect(stored.defaultPurchasePrice.toString()).toBe('45.5');
    expect(stored.reorderLevel.toString()).toBe('10');
    expect(stored.reorderQuantity.toString()).toBe('24');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'Product', entityId: created.id },
    });
    expect(audit.action).toBe('product.create');
    expect(audit.organizationId).toBe(orgA.id);
    expect(audit.userId).toBe(userA.id);
  });

  it('serializes money and quantity as exact decimal strings', async () => {
    const created = await makeProduct(ctxA, {
      defaultSellingPrice: '1234.99',
      reorderQuantity: '1.234',
    });
    const row = (await productService.findById(
      ctxA,
      created.id,
    )) as unknown as Record<string, unknown>;

    // The repository hands back a Prisma Decimal, so the wire form is whatever
    // JSON serialization produces. That is where the value has to be a string
    // rather than a double.
    const wire = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
    expect(typeof wire.defaultSellingPrice).toBe('string');
    expect(wire.defaultSellingPrice).toBe('1234.99');
    expect(wire.reorderQuantity).toBe('1.234');
  });

  it('scopes a read to the caller organization', async () => {
    const theirs = await makeProduct(ctxB, { name: 'Their Product' });

    await expect(productService.findById(ctxA, theirs.id)).rejects.toThrow(
      /not found/i,
    );
    await expect(
      productService.update(ctxA, theirs.id, { name: 'Hijacked' }),
    ).rejects.toThrow(/not found/i);
    await expect(productService.deactivate(ctxA, theirs.id)).rejects.toThrow(
      /not found/i,
    );
    await expect(productService.delete(ctxA, theirs.id)).rejects.toThrow(
      /not found/i,
    );

    const untouched = await prisma.product.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(untouched.name).toBe('Their Product');
    expect(untouched.status).toBe('active');
  });

  it('scopes a list to the caller organization', async () => {
    const markerA = suffix();
    const markerB = suffix();
    await makeProduct(ctxA, { name: `Mine ${markerA}` });
    await makeProduct(ctxB, { name: `Theirs ${markerB}` });

    const page = (await productService.findAll(ctxA, {
      page: 1,
      limit: 100,
    })) as { data: Array<{ organizationId: string; name: string }> };

    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((row) => row.organizationId === orgA.id)).toBe(true);
    expect(page.data.some((row) => row.name.includes(markerB))).toBe(false);
    expect(page.data.some((row) => row.name.includes(markerA))).toBe(true);
  });

  it('joins the four parents with display fields only', async () => {
    const category = await prisma.category.create({
      data: { organizationId: orgA.id, name: `Cat ${suffix()}` },
    });
    const brand = await prisma.brand.create({
      data: { organizationId: orgA.id, name: `Brand ${suffix()}` },
    });
    const unit = await prisma.unit.create({
      data: {
        organizationId: orgA.id,
        name: `Unit ${suffix()}`,
        code: `u${suffix()}`,
        precision: 3,
      },
    });

    const created = await makeProduct(ctxA, {
      categoryId: category.id,
      brandId: brand.id,
      unitId: unit.id,
    });

    const page = (await productService.findAll(ctxA, {
      page: 1,
      limit: 100,
      search: created.sku,
    })) as {
      data: Array<{
        category: { id: string; name: string } | null;
        brand: { id: string; name: string } | null;
        unit: { id: string; code: string; precision: number } | null;
        taxCategory: unknown;
      }>;
    };

    const row = page.data[0];
    expect(row.category).toEqual({ id: category.id, name: category.name });
    expect(row.brand).toEqual({ id: brand.id, name: brand.name });
    expect(row.unit).toEqual({
      id: unit.id,
      code: unit.code,
      precision: 3,
    });
    // The tax category has no repository until Task 05.07, and no rate is ever
    // selected onto a catalog row.
    expect(row.taxCategory).toBeNull();
  });

  it('refuses a parent from another organization', async () => {
    const foreignCategory = await prisma.category.create({
      data: { organizationId: orgB.id, name: `Foreign ${suffix()}` },
    });

    await expect(
      makeProduct(ctxA, { categoryId: foreignCategory.id }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The foreign key would have accepted this row, which is why the check
    // exists (BR-040).
    const count = await prisma.product.count({
      where: { categoryId: foreignCategory.id },
    });
    expect(count).toBe(0);
  });

  it('rejects a duplicate SKU in the same organization as a conflict', async () => {
    const s = suffix();
    await makeProduct(ctxA, { sku: `DUP-${s}` });

    await expect(makeProduct(ctxA, { sku: `DUP-${s}` })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows the same SKU in another organization', async () => {
    const s = suffix();
    await makeProduct(ctxA, { sku: `SHARED-${s}` });
    const other = await makeProduct(ctxB, { sku: `SHARED-${s}` });

    expect((other as { id: string }).id).toBeTruthy();
  });

  it('clears an optional parent with an explicit null', async () => {
    const category = await prisma.category.create({
      data: { organizationId: orgA.id, name: `Clear ${suffix()}` },
    });
    const created = await makeProduct(ctxA, { categoryId: category.id });

    const updated = (await productService.update(ctxA, created.id, {
      categoryId: null,
    })) as { categoryId: string | null };

    expect(updated.categoryId).toBeNull();
  });

  it('deactivates without removing history', async () => {
    const created = await makeProduct(ctxA);
    const updated = (await productService.deactivate(ctxA, created.id)) as {
      status: string;
    };

    expect(updated.status).toBe('inactive');
    expect(await prisma.product.count({ where: { id: created.id } })).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entity: 'Product',
        entityId: created.id,
        action: 'product.deactivate',
      },
    });
    expect(audit.organizationId).toBe(orgA.id);
  });

  it('deletes a product that nothing references', async () => {
    const created = await makeProduct(ctxA);

    await productService.delete(ctxA, created.id);

    expect(await prisma.product.count({ where: { id: created.id } })).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entity: 'Product',
        entityId: created.id,
        action: 'product.delete',
      },
    });
    expect(audit.before).not.toBeNull();
  });

  it('refuses to delete a product that only has a batch row', async () => {
    const created = await makeProduct(ctxA);
    await prisma.productBatch.create({
      data: {
        productId: created.id,
        batchNumber: `B-${suffix()}`,
        unitCost: '100.00',
      },
    });

    // The batch is the only child here: no balance and no movement exist, so a
    // guard that counted only the inventory tables would have let this through
    // and the database would have answered with a raw foreign key error.
    await expect(productService.delete(ctxA, created.id)).rejects.toThrow(
      /inventory history/,
    );
    expect(await prisma.product.count({ where: { id: created.id } })).toBe(1);
  });

  it('refuses to delete a product that a barcode does not block', async () => {
    const created = await makeProduct(ctxA);
    await prisma.productBarcode.create({
      data: {
        organizationId: orgA.id,
        productId: created.id,
        barcode: `98${suffix()}`,
      },
    });

    // product_barcodes cascades, and a barcode carries no financial or
    // inventory meaning of its own, so it must not make a product undeletable.
    await productService.delete(ctxA, created.id);

    expect(await prisma.product.count({ where: { id: created.id } })).toBe(0);
  });

  it('rolls the product back when the audit write fails', async () => {
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new ProductService(
      new PrismaProductRepository(prismaService),
      new PrismaCategoryRepository(prismaService),
      new PrismaBrandRepository(prismaService),
      new PrismaUnitRepository(prismaService),
      new PrismaTaxCategoryRepository(prismaService),
      prismaService,
      failing,
    );

    await expect(
      service.create(ctxA, {
        name: 'Rolled Back',
        sku: `RB-${suffix()}`,
      }),
    ).rejects.toThrow('audit storage unavailable');

    // The create and its audit shared one transaction, so the product insert
    // was rolled back with the audit failure.
    expect(await prisma.product.count({ where: { name: 'Rolled Back' } })).toBe(
      0,
    );
  });

  it('joins a caller-supplied transaction instead of opening its own', async () => {
    const sku = `AM-${suffix()}`;

    await prisma.$transaction(async (tx) => {
      const created = (await productService.create(
        ctxA,
        { name: 'Ambient', sku },
        tx as unknown as PrismaTx,
      )) as { id: string };

      // If the audit had been written on a separate connection in its own
      // transaction, its row would not be visible from inside this one yet.
      const audits = await tx.auditLog.count({
        where: { entity: 'Product', entityId: created.id },
      });
      expect(audits).toBe(1);
    });

    expect(await prisma.product.count({ where: { sku } })).toBe(1);
  });

  it('sorts on an allow-listed column and ignores any other', async () => {
    const s = suffix();
    await makeProduct(ctxA, { name: `AAA ${s}`, sku: `ZZZ-${s}` });
    await makeProduct(ctxA, { name: `MMM ${s}`, sku: `MMM-${s}` });

    const ascending = (await productService.findAll(ctxA, {
      page: 1,
      limit: 100,
      sortBy: 'name',
      sortOrder: 'asc',
    })) as { data: Array<{ name: string }> };
    const names = ascending.data.map((row) => row.name);
    expect([...names].sort()).toEqual(names);

    // organizationId is a real column, but a client must not be able to order
    // rows by tenant, so the allow-list falls back to the default.
    const fallback = (await productService.findAll(ctxA, {
      page: 1,
      limit: 100,
      sortBy: 'organizationId',
      sortOrder: 'asc',
    })) as { data: Array<{ organizationId: string }> };
    expect(fallback.data.every((row) => row.organizationId === orgA.id)).toBe(
      true,
    );
  });

  it('paginates without losing or duplicating rows', async () => {
    const marker = suffix();
    for (let index = 0; index < 3; index += 1) {
      await makeProduct(ctxA, { name: `Page ${index} ${marker}` });
    }

    const first = (await productService.findAll(ctxA, {
      page: 1,
      limit: 2,
    })) as {
      data: Array<{ id: string; organizationId: string }>;
      total: number;
      totalPages: number;
      page: number;
      limit: number;
    };
    const second = (await productService.findAll(ctxA, {
      page: 2,
      limit: 2,
    })) as { data: Array<{ id: string; organizationId: string }> };

    expect(first.data).toHaveLength(2);
    expect(first.page).toBe(1);
    expect(first.limit).toBe(2);
    expect(first.totalPages).toBe(Math.ceil(first.total / 2));

    const ids = [...first.data, ...second.data].map((row) => row.id);
    // Two pages of two must not repeat a row, and neither may leak a tenant.
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      [...first.data, ...second.data].every(
        (row) => row.organizationId === orgA.id,
      ),
    ).toBe(true);
  });
});
