import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionTestDatabase } from './db-test-db.helper.js';
import {
  DEV_PERMISSION_CODES,
  DEV_SEED_ORG_ID,
  runSeed,
} from '../../prisma/seed.js';

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
  await prisma.userStoreAccess.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.rolePermission.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.productBarcode.deleteMany({});
  await prisma.productPrice.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.unitConversion.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.taxCategory.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.inventoryLocation.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.register.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.$disconnect();
});

describe('Development seed data', () => {
  it('seeds the full demo master dataset under a fixed demo organization', async () => {
    const summary = await runSeed(prisma);

    expect(summary.organizationId).toBe(DEV_SEED_ORG_ID);

    const org = await prisma.organization.findUnique({
      where: { id: DEV_SEED_ORG_ID },
    });
    expect(org?.currency).toBe('NPR');
    expect(org?.timezone).toBe('Asia/Kathmandu');

    const store = await prisma.store.findUnique({
      where: {
        organizationId_code: { organizationId: org.id, code: 'KTM-01' },
      },
    });
    expect(store?.name).toBe('Kathmandu Store');

    const registers = await prisma.register.findMany({
      where: { storeId: store?.id },
      orderBy: { code: 'asc' },
    });
    expect(registers.map((r) => r.code)).toEqual(['REG-01', 'REG-02']);

    const users = await prisma.user.findMany({
      where: { organizationId: org.id },
      orderBy: { email: 'asc' },
    });
    expect(users.map((u) => u.email)).toEqual([
      'admin@minimart.local',
      'cashier@minimart.local',
      'manager@minimart.local',
    ]);

    const roles = await prisma.role.findMany({
      where: { organizationId: org.id },
      orderBy: { code: 'asc' },
    });
    expect(roles.map((r) => r.code)).toEqual(['cashier', 'manager', 'owner']);

    const permissions = await prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });
    const codesByDbOrder = permissions.map((p) => p.code);
    expect([...codesByDbOrder].sort()).toEqual(
      [...DEV_PERMISSION_CODES].sort(),
    );
    expect(codesByDbOrder[0]).toBe('cash:close');

    const categories = await prisma.category.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
    });
    expect(categories.length).toBe(6);

    const units = await prisma.unit.findMany({
      where: { organizationId: org.id },
      orderBy: { code: 'asc' },
    });
    expect(units.map((u) => u.code)).toEqual([
      'BOX',
      'DOZ',
      'KG',
      'LTR',
      'PCS',
      'PKT',
    ]);

    const products = await prisma.product.findMany({
      where: { organizationId: org.id },
      orderBy: { sku: 'asc' },
    });
    expect(summary.products).toBe(12);
    expect(products).toHaveLength(12);

    const barcodes = await prisma.productBarcode.count({
      where: { organizationId: org.id },
    });
    const batches = await prisma.productBatch.count({
      where: { product: { organizationId: org.id } },
    });
    const suppliers = await prisma.supplier.count({
      where: { organizationId: org.id },
    });
    const customers = await prisma.customer.count({
      where: { organizationId: org.id },
    });
    const expenseCategories = await prisma.expenseCategory.count({
      where: { organizationId: org.id },
    });
    const locations = await prisma.inventoryLocation.count({
      where: { storeId: store?.id },
    });
    expect(barcodes).toBe(12);
    expect(batches).toBe(12);
    expect(suppliers).toBe(3);
    expect(customers).toBe(3);
    expect(expenseCategories).toBe(6);
    expect(locations).toBe(2);
  });

  it('catalogues the permissions documented in brain/SECURITY.md', async () => {
    expect(DEV_PERMISSION_CODES).toHaveLength(20);
    const rows = await prisma.permission.findMany({
      orderBy: { code: 'asc' },
      where: { code: { in: DEV_PERMISSION_CODES } },
    });
    expect(rows).toHaveLength(20);

    const owner = await prisma.role.findUnique({
      where: {
        organizationId_code: { organizationId: DEV_SEED_ORG_ID, code: 'owner' },
      },
      include: { permissions: { include: { permission: true } } },
    });
    expect(owner?.permissions).toHaveLength(20);

    const cashier = await prisma.role.findUnique({
      where: {
        organizationId_code: {
          organizationId: DEV_SEED_ORG_ID,
          code: 'cashier',
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
    const cashierCodes = cashier?.permissions
      .map((rp) => rp.permission.code)
      .sort();
    expect(cashierCodes).toEqual(
      [
        'cash:close',
        'cash:open',
        'cash:withdraw',
        'customers:view',
        'inventory:view',
        'reports:sales',
        'sales:create',
        'sales:return',
      ].sort(),
    );
  });

  it('seeds a verified Nepal VAT tax category', async () => {
    const vat = await prisma.taxCategory.findUnique({
      where: {
        organizationId_code: {
          organizationId: DEV_SEED_ORG_ID,
          code: 'VAT-STD',
        },
      },
    });
    expect(vat?.name).toBe('Standard VAT');
    expect(Number(vat?.rate.toString())).toBe(13);
    expect(vat?.taxType).toBe('VAT');
    expect(vat?.status).toBe('active');
    expect(vat?.effectiveFrom.toISOString()).toBe('2005-01-14T00:00:00.000Z');
    expect(vat?.effectiveTo).toBeNull();

    const products = await prisma.product.findMany({
      where: { organizationId: DEV_SEED_ORG_ID, taxCategoryId: vat?.id },
    });
    expect(products).toHaveLength(12);
  });

  it('writes secure dev credential hashes and grants store access', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@minimart.local' },
    });
    // The seed must use the same algorithm as PasswordService, so a seeded
    // credential can actually authenticate and the two can never drift apart.
    expect(admin?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(admin?.passwordHash).not.toContain('MinimartDev@123');

    const store = await prisma.store.findUnique({
      where: {
        organizationId_code: {
          organizationId: DEV_SEED_ORG_ID,
          code: 'KTM-01',
        },
      },
    });
    const accesses = await prisma.userStoreAccess.count({
      where: { storeId: store?.id },
    });
    expect(accesses).toBe(3);

    const adminRoles = await prisma.userRole.findMany({
      where: { userId: admin?.id },
      include: { role: true },
    });
    expect(adminRoles.map((ur) => ur.role.code)).toEqual(['owner']);

    const rejectsPlaintext = await prisma.user.findFirst({
      where: { passwordHash: 'MinimartDev@123' },
    });
    expect(rejectsPlaintext).toBeNull();
  });

  it('links products to prices, batches, and supplier-sourced costs', async () => {
    const priceRows = await prisma.productPrice.count({
      where: { product: { organizationId: DEV_SEED_ORG_ID } },
    });
    expect(priceRows).toBe(12);

    const water = await prisma.product.findUnique({
      where: {
        organizationId_sku: { organizationId: DEV_SEED_ORG_ID, sku: 'WTR-001' },
      },
    });
    const barcode = await prisma.productBarcode.findUnique({
      where: {
        organizationId_barcode: {
          organizationId: DEV_SEED_ORG_ID,
          barcode: '8905000000011',
        },
      },
      include: { product: true },
    });
    expect(barcode?.isPrimary).toBe(true);
    expect(barcode?.productId).toBe(water?.id);

    const batches = await prisma.productBatch.findMany({
      where: { product: { organizationId: DEV_SEED_ORG_ID } },
      include: { supplier: true },
    });
    expect(batches.every((b) => b.supplier?.code === 'SNP-001')).toBe(true);
    expect(batches.some((b) => b.expiryDate !== null)).toBe(true);

    const productHasTax = await prisma.product.count({
      where: {
        organizationId: DEV_SEED_ORG_ID,
        taxCategoryId: { not: null },
      },
    });
    expect(productHasTax).toBe(12);
  });

  it('is idempotent: rerunning leaves every seeded table unchanged', async () => {
    await runSeed(prisma);
    await runSeed(prisma);

    const [orgs, users, roles, perms, cats, prods, prices, batches, suppliers] =
      await Promise.all([
        prisma.organization.count({}),
        prisma.user.count({}),
        prisma.role.count({}),
        prisma.permission.count({}),
        prisma.category.count({}),
        prisma.product.count({}),
        prisma.productPrice.count({}),
        prisma.productBatch.count({}),
        prisma.supplier.count({}),
      ]);

    expect(orgs).toBe(1);
    expect(users).toBe(3);
    expect(roles).toBe(3);
    expect(perms).toBe(20);
    expect(cats).toBe(6);
    expect(prods).toBe(12);
    expect(prices).toBe(12);
    expect(batches).toBe(12);
    expect(suppliers).toBe(3);

    const admin = await prisma.user.findUnique({
      where: { email: 'admin@minimart.local' },
    });
    const accessRows = await prisma.userStoreAccess.count({
      where: { userId: admin?.id },
    });
    expect(accessRows).toBe(1);
  });
});
