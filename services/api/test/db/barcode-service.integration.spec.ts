import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient as PrismaClientType } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  PrismaService,
  PrismaTx,
} from '../../src/database/prisma.service.js';
import type { TenantContext } from '../../src/common/auth/authenticated-user.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { PrismaAuditRepository } from '../../src/audit/prisma-audit.repository.js';
import { PrismaBarcodeRepository } from '../../src/barcodes/prisma-barcode.repository.js';
import { PrismaProductRepository } from '../../src/products/prisma-product.repository.js';
import { BarcodeService } from '../../src/barcodes/barcode.service.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;
let prismaService: PrismaService;
let barcodeService: BarcodeService;
let auditService: AuditService;

let orgA: { id: string };
let orgB: { id: string };
let ctxA: TenantContext;
let ctxB: TenantContext;

beforeAll(async () => {
  const url = await provisionTestDatabase();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  // The repositories reach the database through PrismaService rather than a raw
  // client, and the demotion plus the promotion have to share one transaction,
  // so the service is assembled by hand over a genuine `$transaction`.
  prismaService = {
    client: prisma,
    runInTransaction: <T>(fn: (tx: PrismaTx) => Promise<T>) =>
      prisma.$transaction((tx) => fn(tx as unknown as PrismaTx)),
  } as unknown as PrismaService;

  auditService = new AuditService(new PrismaAuditRepository(prismaService));
  const productRepository = new PrismaProductRepository(prismaService);
  barcodeService = new BarcodeService(
    new PrismaBarcodeRepository(prismaService),
    productRepository,
    prismaService,
    auditService,
  );

  orgA = await prisma.organization.create({
    data: {
      name: 'Barcode Svc Org A',
      legalName: 'A Pvt Ltd',
      currency: 'NPR',
    },
  });
  orgB = await prisma.organization.create({
    data: {
      name: 'Barcode Svc Org B',
      legalName: 'B Pvt Ltd',
      currency: 'NPR',
    },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: orgA.id,
      email: 'barcode-service@example.com',
      passwordHash: 'not-a-real-hash',
      name: 'Barcode Service Tester',
    },
  });
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
  await prisma.productBarcode.deleteMany({});
  await prisma.product.deleteMany({});
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
  return (await prisma.product.create({
    data: {
      organizationId: ctx.organizationId,
      name: `Product ${s}`,
      sku: `SKU-${s}`,
      status: 'active',
      ...overrides,
    },
  })) as { id: string; sku: string };
}

type CreatedBarcode = {
  id: string;
  organizationId: string;
  productId: string;
  barcode: string;
  barcodeType: string | null;
  isPrimary: boolean;
};

async function makeBarcode(
  ctx: TenantContext,
  productId: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedBarcode> {
  return (await barcodeService.create(ctx, productId, {
    barcode: `BC-${suffix()}`,
    ...overrides,
  } as never)) as CreatedBarcode;
}

async function primariesOf(productId: string): Promise<string[]> {
  const rows = await prisma.productBarcode.findMany({
    where: { productId, isPrimary: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.barcode);
}

describe('BarcodeService against PostgreSQL', () => {
  it('stores the value exactly as supplied, with the principal organization', async () => {
    const product = await makeProduct(ctxA);
    const created = await makeBarcode(ctxA, product.id, {
      barcode: 'COLD-DRINK-500ML',
      barcodeType: 'IN_STORE',
    });

    const stored = await prisma.productBarcode.findUniqueOrThrow({
      where: { id: created.id },
    });
    // The organization comes from the token, and the value is not trimmed or
    // case-folded: a scanner reads the printed string back.
    expect(stored.organizationId).toBe(orgA.id);
    expect(stored.productId).toBe(product.id);
    expect(stored.barcode).toBe('COLD-DRINK-500ML');
    expect(stored.barcodeType).toBe('IN_STORE');
    expect(stored.isPrimary).toBe(false);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'ProductBarcode', entityId: created.id },
    });
    expect(audit.action).toBe('product_barcode.create');
    expect(audit.userId).toBe(ctxA.userId);
  });

  it('defaults an absent type to null and an absent primary flag to false', async () => {
    const product = await makeProduct(ctxA);
    const created = await makeBarcode(ctxA, product.id);

    const stored = await prisma.productBarcode.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.barcodeType).toBeNull();
    expect(stored.isPrimary).toBe(false);
  });

  it('rejects a value another product of the same organization already uses', async () => {
    const first = await makeProduct(ctxA);
    const second = await makeProduct(ctxA);
    const value = `89${suffix()}`;
    await makeBarcode(ctxA, first.id, { barcode: value });

    await expect(
      makeBarcode(ctxA, second.id, { barcode: value }),
    ).rejects.toBeInstanceOf(ConflictException);

    // The rejection happens before the insert, so no second row exists and the
    // first product still owns the value.
    expect(
      await prisma.productBarcode.count({ where: { barcode: value } }),
    ).toBe(1);
  });

  it('lets a second organization use the same value', async () => {
    const mine = await makeProduct(ctxA);
    const theirs = await makeProduct(ctxB);
    const value = `77${suffix()}`;
    await makeBarcode(ctxA, mine.id, { barcode: value });

    const foreign = await makeBarcode(ctxB, theirs.id, { barcode: value });

    // The unique key is (organizationId, barcode), so the same printed code can
    // exist once per tenant without either row conflicting.
    const stored = await prisma.productBarcode.findUniqueOrThrow({
      where: { id: foreign.id },
    });
    expect(stored.barcode).toBe(value);
    expect(
      await prisma.productBarcode.count({ where: { barcode: value } }),
    ).toBe(2);
  });

  it('leaves exactly one primary after a second barcode is promoted', async () => {
    const product = await makeProduct(ctxA);
    const first = await makeBarcode(ctxA, product.id, { isPrimary: true });
    const second = await makeBarcode(ctxA, product.id, { isPrimary: true });

    expect(await primariesOf(product.id)).toEqual([second.barcode]);

    // The demotion clears the flag rather than removing the row, so the previous
    // primary is still scannable.
    const previous = await prisma.productBarcode.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(previous.isPrimary).toBe(false);
  });

  it('promotes through an update and demotes the previous primary', async () => {
    const product = await makeProduct(ctxA);
    const first = await makeBarcode(ctxA, product.id, { isPrimary: true });
    const second = await makeBarcode(ctxA, product.id);

    await barcodeService.update(ctxA, product.id, second.id, {
      isPrimary: true,
    });

    expect(await primariesOf(product.id)).toEqual([second.barcode]);
    const previous = await prisma.productBarcode.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(previous.isPrimary).toBe(false);
  });

  it('leaves the product with no primary when the primary is given up', async () => {
    const product = await makeProduct(ctxA);
    const only = await makeBarcode(ctxA, product.id, { isPrimary: true });

    await barcodeService.update(ctxA, product.id, only.id, {
      isPrimary: false,
    });

    // Nothing documents a successor, so none is invented.
    expect(await primariesOf(product.id)).toEqual([]);
  });

  it('leaves the product with no primary when the primary is deleted', async () => {
    const product = await makeProduct(ctxA);
    const primary = await makeBarcode(ctxA, product.id, { isPrimary: true });
    const other = await makeBarcode(ctxA, product.id);

    await barcodeService.delete(ctxA, product.id, primary.id);

    expect(await primariesOf(product.id)).toEqual([]);
    expect(await prisma.productBarcode.count({ where: { id: other.id } })).toBe(
      1,
    );
  });

  it('clears the type on an explicit null and leaves other fields alone', async () => {
    const product = await makeProduct(ctxA);
    const created = await makeBarcode(ctxA, product.id, {
      barcodeType: 'EAN13',
      isPrimary: true,
    });

    const updated = (await barcodeService.update(ctxA, product.id, created.id, {
      barcodeType: null,
    } as never)) as CreatedBarcode;

    expect(updated.barcodeType).toBeNull();
    // isPrimary was omitted, so the promotion is untouched.
    expect(updated.isPrimary).toBe(true);
  });

  it('scopes every read and write to the caller organization', async () => {
    const theirs = await makeProduct(ctxB);
    const foreign = await makeBarcode(ctxB, theirs.id, {
      barcode: 'FOREIGN-ONLY-1',
    });

    await expect(
      barcodeService.findById(ctxA, theirs.id, foreign.id),
    ).rejects.toThrow(/product not found/i);
    await expect(barcodeService.findAll(ctxA, theirs.id)).rejects.toThrow(
      /product not found/i,
    );
    await expect(
      barcodeService.update(ctxA, theirs.id, foreign.id, { isPrimary: true }),
    ).rejects.toThrow(/product not found/i);
    await expect(
      barcodeService.delete(ctxA, theirs.id, foreign.id),
    ).rejects.toThrow(/product not found/i);
    await expect(
      barcodeService.create(ctxA, theirs.id, { barcode: 'INJECTED-1' }),
    ).rejects.toThrow(/product not found/i);

    const untouched = await prisma.productBarcode.findUniqueOrThrow({
      where: { id: foreign.id },
    });
    expect(untouched.barcode).toBe('FOREIGN-ONLY-1');
    expect(
      await prisma.productBarcode.count({ where: { barcode: 'INJECTED-1' } }),
    ).toBe(0);
  });

  it('cannot reach a sibling product barcode through a product of the same organization', async () => {
    const first = await makeProduct(ctxA);
    const second = await makeProduct(ctxA);
    const barcode = await makeBarcode(ctxA, first.id);

    // The parent resolves because the sibling product is a real product of this
    // organization, but the barcode lookup is keyed on the product as well.
    await expect(
      barcodeService.findById(ctxA, second.id, barcode.id),
    ).rejects.toThrow(/barcode not found/i);
    await expect(
      barcodeService.delete(ctxA, second.id, barcode.id),
    ).rejects.toThrow(/barcode not found/i);

    expect(
      await prisma.productBarcode.count({ where: { id: barcode.id } }),
    ).toBe(1);
  });

  it('lists only the barcodes of the named product', async () => {
    const first = await makeProduct(ctxA);
    const second = await makeProduct(ctxA);
    const mineA = await makeBarcode(ctxA, first.id);
    const mineB = await makeBarcode(ctxA, first.id);
    await makeBarcode(ctxA, second.id);

    const listed = (await barcodeService.findAll(
      ctxA,
      first.id,
    )) as CreatedBarcode[];

    expect(listed.map((r) => r.id).sort()).toEqual([mineA.id, mineB.id].sort());
  });

  it('rolls the insert back when the audit write fails', async () => {
    const product = await makeProduct(ctxA);
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new BarcodeService(
      new PrismaBarcodeRepository(prismaService),
      new PrismaProductRepository(prismaService),
      prismaService,
      failing,
    );
    const value = `RB${suffix()}`;

    await expect(
      service.create(ctxA, product.id, { barcode: value }),
    ).rejects.toThrow('audit storage unavailable');

    expect(
      await prisma.productBarcode.count({ where: { barcode: value } }),
    ).toBe(0);
  });

  it('rolls a promotion back when the audit write fails', async () => {
    const product = await makeProduct(ctxA);
    const first = await makeBarcode(ctxA, product.id, { isPrimary: true });
    const second = await makeBarcode(ctxA, product.id);
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new BarcodeService(
      new PrismaBarcodeRepository(prismaService),
      new PrismaProductRepository(prismaService),
      prismaService,
      failing,
    );

    await expect(
      service.update(ctxA, product.id, second.id, { isPrimary: true }),
    ).rejects.toThrow('audit storage unavailable');

    // The demotion and the promotion shared the transaction that the audit
    // failure rolled back, so the original primary is still primary. Without the
    // shared transaction the product would have been left with none.
    expect(await primariesOf(product.id)).toEqual([first.barcode]);
  });

  it('joins a caller-supplied transaction instead of opening its own', async () => {
    const product = await makeProduct(ctxA);

    await prisma.$transaction(async (tx) => {
      const created = (await barcodeService.create(
        ctxA,
        product.id,
        { barcode: `AM-${suffix()}`, isPrimary: true },
        tx as unknown as PrismaTx,
      )) as CreatedBarcode;

      // If the audit had been written on a separate connection in its own
      // transaction, its row would not be visible from inside this one yet.
      const audits = await tx.auditLog.count({
        where: { entity: 'ProductBarcode', entityId: created.id },
      });
      expect(audits).toBe(1);
    });

    expect(await primariesOf(product.id)).toHaveLength(1);
  });

  it('records the removal with the row as it was', async () => {
    const product = await makeProduct(ctxA);
    const created = await makeBarcode(ctxA, product.id, {
      barcodeType: 'EAN13',
    });

    await barcodeService.delete(ctxA, product.id, created.id);

    expect(
      await prisma.productBarcode.count({ where: { id: created.id } }),
    ).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'ProductBarcode', entityId: created.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.action).toBe('product_barcode.delete');
  });

  it('removes the barcodes of a product that is itself deleted', async () => {
    const product = await makeProduct(ctxA);
    await makeBarcode(ctxA, product.id);

    // product_barcodes cascades, so a barcode never blocks a product delete and
    // leaves nothing behind.
    await prisma.product.delete({ where: { id: product.id } });

    expect(
      await prisma.productBarcode.count({ where: { productId: product.id } }),
    ).toBe(0);
  });
});
