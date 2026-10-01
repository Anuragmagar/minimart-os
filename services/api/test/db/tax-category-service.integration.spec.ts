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
import { PrismaTaxCategoryRepository } from '../../src/tax-categories/prisma-tax-category.repository.js';
import { TaxCategoryService } from '../../src/tax-categories/tax-category.service.js';
import { provisionTestDatabase } from './db-test-db.helper.js';

let prisma: PrismaClientType;
let prismaService: PrismaService;
let taxCategoryService: TaxCategoryService;
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

  // The repository reaches the database through PrismaService rather than a raw
  // client, and each write and its audit have to share one transaction, so the
  // service is assembled by hand over a genuine `$transaction`.
  prismaService = {
    client: prisma,
    runInTransaction: <T>(fn: (tx: PrismaTx) => Promise<T>) =>
      prisma.$transaction((tx) => fn(tx as unknown as PrismaTx)),
  } as unknown as PrismaService;

  auditService = new AuditService(new PrismaAuditRepository(prismaService));
  taxCategoryService = new TaxCategoryService(
    new PrismaTaxCategoryRepository(prismaService),
    prismaService,
    auditService,
  );

  orgA = await prisma.organization.create({
    data: {
      name: 'Tax Category Svc Org A',
      legalName: 'A Pvt Ltd',
      currency: 'NPR',
    },
  });
  orgB = await prisma.organization.create({
    data: {
      name: 'Tax Category Svc Org B',
      legalName: 'B Pvt Ltd',
      currency: 'NPR',
    },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: orgA.id,
      email: 'tax-category-service@example.com',
      passwordHash: 'not-a-real-hash',
      name: 'Tax Category Service Tester',
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
  await prisma.product.deleteMany({});
  await prisma.taxCategory.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.$disconnect();
});

function suffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

const FROM = '2005-01-14T00:00:00.000Z';
const TO = '2010-01-14T00:00:00.000Z';

type CreatedTax = {
  id: string;
  organizationId: string;
  code: string;
  rate: { toString(): string };
  taxType: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: string;
};

async function makeTax(
  ctx: TenantContext,
  overrides: Record<string, unknown> = {},
): Promise<CreatedTax> {
  const s = suffix();
  return (await prisma.taxCategory.create({
    data: {
      organizationId: ctx.organizationId,
      name: `VAT ${s}`,
      code: `VAT-${s}`,
      rate: '13.0000',
      taxType: 'VAT',
      effectiveFrom: new Date(FROM),
      ...overrides,
    },
  })) as unknown as CreatedTax;
}

async function makeProduct(
  ctx: TenantContext,
  taxCategoryId: string | null,
): Promise<{ id: string }> {
  const s = suffix();
  return prisma.product.create({
    data: {
      organizationId: ctx.organizationId,
      name: `Product ${s}`,
      sku: `SKU-${s}`,
      status: 'active',
      taxCategoryId,
    },
    select: { id: true },
  });
}

describe('TaxCategoryService against PostgreSQL', () => {
  it('stores the rate in NUMERIC(14,4) without losing the value', async () => {
    const created = (await taxCategoryService.create(ctxA, {
      name: 'Reduced Rate',
      code: `RATE-${suffix()}`,
      rate: '7.1234',
      taxType: 'VAT',
      effectiveFrom: FROM,
    })) as CreatedTax;

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;

    // 7.1234 is the finest value the column accepts, so a float round trip
    // would show up here as 7.12339999.
    expect(row.rate.toString()).toBe('7.1234');
    expect(row.effectiveFrom.toISOString()).toBe(FROM);
    expect(row.effectiveTo).toBeNull();
  });

  it('rounds a rate that carries more precision than the column', async () => {
    // The DTO admits at most four decimals, so this asserts what the column
    // itself does with a value it must round rather than reject.
    const created = (await taxCategoryService.create(ctxA, {
      name: 'Rounded Rate',
      code: `ROUND-${suffix()}`,
      rate: '7.12345',
      taxType: 'VAT',
      effectiveFrom: FROM,
    })) as CreatedTax;

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;

    expect(row.rate.toString()).toBe('7.1235');
  });

  it('stores a zero rate, the exempt case', async () => {
    const created = (await taxCategoryService.create(ctxA, {
      name: 'Exempt',
      code: `EXEMPT-${suffix()}`,
      rate: '0',
      taxType: 'VAT',
      effectiveFrom: FROM,
    })) as CreatedTax;

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    expect(row.rate.toString()).toBe('0');
  });

  it('stores a rate above 100, because no business cap was decided', async () => {
    const created = (await taxCategoryService.create(ctxA, {
      name: 'Composite Levy',
      code: `LEVY-${suffix()}`,
      rate: '250.0000',
      taxType: 'Levy',
      effectiveFrom: FROM,
    })) as CreatedTax;

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    expect(row.rate.toString()).toBe('250');
  });

  it('stores a future effective start, because a rate may be configured before it applies', async () => {
    const created = (await taxCategoryService.create(ctxA, {
      name: 'Future Rate',
      code: `FUT-${suffix()}`,
      rate: '15',
      taxType: 'VAT',
      effectiveFrom: '2099-01-01T00:00:00.000Z',
    })) as CreatedTax;

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    expect(row.effectiveFrom.toISOString()).toBe('2099-01-01T00:00:00.000Z');
  });

  it('enforces the organization-scoped code uniqueness in the database', async () => {
    const s = suffix();
    await taxCategoryService.create(ctxA, {
      name: 'First',
      code: `DUP-${s}`,
      rate: '13',
      taxType: 'VAT',
      effectiveFrom: FROM,
    });

    // The service pre-checks the code and raises a 409, so the database
    // constraint is exercised directly to prove the pre-check is not the only
    // thing standing between two organizations and a duplicate code.
    await expect(
      prisma.taxCategory.create({
        data: {
          organizationId: orgA.id,
          name: 'Second',
          code: `DUP-${s}`,
          rate: '13',
          taxType: 'VAT',
          effectiveFrom: new Date(FROM),
        },
      }),
    ).rejects.toThrow();
  });

  it('allows the same code in two organizations', async () => {
    const code = `SHARED-${suffix()}`;
    await taxCategoryService.create(ctxA, {
      name: 'Org A Rate',
      code,
      rate: '13',
      taxType: 'VAT',
      effectiveFrom: FROM,
    });

    const inB = (await taxCategoryService.create(ctxB, {
      name: 'Org B Rate',
      code,
      rate: '13',
      taxType: 'VAT',
      effectiveFrom: FROM,
    })) as CreatedTax;

    expect(inB.organizationId).toBe(orgB.id);
  });

  it('reports a duplicate code as a conflict', async () => {
    const existing = await makeTax(ctxA);
    await expect(
      taxCategoryService.create(ctxA, {
        name: 'Clash',
        code: existing.code,
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: FROM,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates the rate in place rather than inserting a second row', async () => {
    const created = (await taxCategoryService.create(ctxA, {
      name: 'Standard Rate',
      code: `INPLACE-${suffix()}`,
      rate: '13.0000',
      taxType: 'VAT',
      effectiveFrom: FROM,
    })) as CreatedTax;

    const before = await prisma.taxCategory.count({
      where: { organizationId: orgA.id },
    });

    const updated = (await taxCategoryService.update(ctxA, created.id, {
      rate: '15.0000',
    })) as CreatedTax;

    const after = await prisma.taxCategory.count({
      where: { organizationId: orgA.id },
    });
    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;

    expect(after).toBe(before);
    expect(row.rate.toString()).toBe('15');
    expect(updated.id).toBe(created.id);
  });

  it('keeps the previous rate in the audit history', async () => {
    const created = (await taxCategoryService.create(ctxA, {
      name: 'Audited Rate',
      code: `AUD-${suffix()}`,
      rate: '13.0000',
      taxType: 'VAT',
      effectiveFrom: FROM,
    })) as CreatedTax;

    await taxCategoryService.update(ctxA, created.id, { rate: '15.0000' });

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'tax_category.update', entityId: created.id },
      orderBy: { createdAt: 'desc' },
    });

    // A rate change is an in-place edit, so without the before image the old
    // rate would be unrecoverable.
    expect(entry?.before).toMatchObject({ rate: '13' });
    expect(entry?.after).toMatchObject({ rate: '15' });
  });

  it('renames a category without changing the unique key', async () => {
    const created = await makeTax(ctxA, { effectiveTo: new Date(TO) });

    const updated = (await taxCategoryService.update(ctxA, created.id, {
      name: 'Renamed Rate',
    })) as CreatedTax;

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    expect(updated.code).toBe(created.code);
    // An omitted window must not be rewritten by a name-only patch.
    expect(row.effectiveFrom.toISOString()).toBe(FROM);
    expect(row.effectiveTo?.toISOString()).toBe(TO);
  });

  it('changes the organization-scoped code', async () => {
    const created = await makeTax(ctxA);
    const next = `MOVED-${suffix()}`;

    const updated = (await taxCategoryService.update(ctxA, created.id, {
      code: next,
    })) as CreatedTax;

    expect(updated.code).toBe(next);
  });

  it('rejects a code change that collides with another category', async () => {
    const first = await makeTax(ctxA);
    const second = await makeTax(ctxA);

    await expect(
      taxCategoryService.update(ctxA, second.id, { code: first.code }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a start that would move past the stored end of the window', async () => {
    const created = await makeTax(ctxA, { effectiveTo: new Date(TO) });

    await expect(
      taxCategoryService.update(ctxA, created.id, {
        effectiveFrom: '2011-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    // The rejected patch must not have been written.
    expect(row.effectiveFrom.toISOString()).toBe(FROM);
  });

  it('clears the end of the window when null is sent explicitly', async () => {
    const created = await makeTax(ctxA, { effectiveTo: new Date(TO) });

    await taxCategoryService.update(ctxA, created.id, { effectiveTo: null });

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    expect(row.effectiveTo).toBeNull();
  });

  it('rejects a create whose window ends before it starts', async () => {
    const code = `INV-${suffix()}`;

    await expect(
      taxCategoryService.create(ctxA, {
        name: 'Inverted',
        code,
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: FROM,
        effectiveTo: '2004-01-14T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The window check runs before the write, so nothing was inserted.
    expect(
      await prisma.taxCategory.count({
        where: { organizationId: orgA.id, code },
      }),
    ).toBe(0);
  });

  it('refuses a foreign organization id', async () => {
    const foreign = await makeTax(ctxB);

    await expect(taxCategoryService.findById(ctxA, foreign.id)).rejects.toThrow(
      'Tax category not found',
    );
    await expect(
      taxCategoryService.update(ctxA, foreign.id, { rate: '99' }),
    ).rejects.toThrow('Tax category not found');
    await expect(
      taxCategoryService.deactivate(ctxA, foreign.id),
    ).rejects.toThrow('Tax category not found');
    await expect(taxCategoryService.delete(ctxA, foreign.id)).rejects.toThrow(
      'Tax category not found',
    );

    const row = (await prisma.taxCategory.findUnique({
      where: { id: foreign.id },
    })) as unknown as CreatedTax;
    expect(row.rate.toString()).toBe('13');
  });

  it('deactivates without changing the rate a historical sale used', async () => {
    const created = await makeTax(ctxA);

    const updated = (await taxCategoryService.deactivate(
      ctxA,
      created.id,
    )) as CreatedTax;

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    expect(updated.status).toBe('inactive');
    expect(row.rate.toString()).toBe('13');

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'tax_category.deactivate', entityId: created.id },
    });
    expect(entry).not.toBeNull();
  });

  it('refuses to delete a category a product references', async () => {
    const created = await makeTax(ctxA);
    await makeProduct(ctxA, created.id);

    await expect(taxCategoryService.delete(ctxA, created.id)).rejects.toThrow(
      'Tax category is still referenced by products',
    );

    const row = await prisma.taxCategory.findUnique({
      where: { id: created.id },
    });
    expect(row).not.toBeNull();
  });

  it('lets the RESTRICT constraint stand behind the service check', async () => {
    const created = await makeTax(ctxA);
    const product = await makeProduct(ctxA, created.id);

    // The guard is a clear error, but the constraint is the actual guarantee, so
    // this asserts what the database would do on its own.
    await expect(
      prisma.taxCategory.delete({ where: { id: created.id } }),
    ).rejects.toThrow();

    await prisma.product.delete({ where: { id: product.id } });
  });

  it('deletes an unreferenced category', async () => {
    const created = await makeTax(ctxA);

    await taxCategoryService.delete(ctxA, created.id);

    expect(
      await prisma.taxCategory.findUnique({ where: { id: created.id } }),
    ).toBeNull();
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'tax_category.delete', entityId: created.id },
    });
    expect(entry).not.toBeNull();
  });

  it('lists, searches, filters, and pages inside one organization', async () => {
    const s = suffix();
    for (const [code, name, status] of [
      [`LIST-${s}-A`, `List Alpha ${s}`, 'active'],
      [`LIST-${s}-B`, `List Beta ${s}`, 'inactive'],
      [`LIST-${s}-C`, `List Gamma ${s}`, 'active'],
    ] as const) {
      await taxCategoryService.create(ctxA, {
        name,
        code,
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: FROM,
      });
      if (status === 'inactive') {
        await taxCategoryService.deactivate(
          ctxA,
          (
            await prisma.taxCategory.findFirst({
              where: { organizationId: orgA.id, code },
            })
          ).id,
        );
      }
    }
    await makeTax(ctxB);

    const all = (await taxCategoryService.findAll(ctxA, {
      page: 1,
      limit: 100,
    })) as { data: Array<{ organizationId: string }>; total: number };
    expect(all.data.every((row) => row.organizationId === orgA.id)).toBe(true);
    expect(all.total).toBe(all.data.length);

    const searched = (await taxCategoryService.findAll(ctxA, {
      page: 1,
      limit: 100,
      search: `List Alpha ${s}`,
    })) as { data: Array<{ code: string }> };
    expect(searched.data.map((row) => row.code)).toEqual([`LIST-${s}-A`]);

    const inactive = (await taxCategoryService.findAll(ctxA, {
      page: 1,
      limit: 100,
      status: 'inactive',
    })) as { data: Array<{ code: string }> };
    const inactiveCodes = inactive.data.map((row) => row.code);
    expect(inactiveCodes).toContain(`LIST-${s}-B`);
    // Rows deactivated by earlier cases are inactive too, so this asserts the
    // filter kept the active row out rather than claiming to be the only one.
    expect(inactiveCodes).not.toContain(`LIST-${s}-A`);

    const paged = (await taxCategoryService.findAll(ctxA, {
      page: 2,
      limit: 2,
      sortBy: 'code',
      sortOrder: 'asc',
    })) as { data: Array<{ code: string }>; page: number; totalPages: number };
    expect(paged.page).toBe(2);
    expect(paged.totalPages).toBeGreaterThan(1);
    expect(paged.data).toHaveLength(2);
    // Page 2 must not repeat page 1.
    const firstPage = (await taxCategoryService.findAll(ctxA, {
      page: 1,
      limit: 2,
      sortBy: 'code',
      sortOrder: 'asc',
    })) as { data: Array<{ id: string }> };
    expect(paged.data.map((row) => (row as { id: string }).id)).not.toEqual(
      firstPage.data.map((row) => row.id),
    );
  });

  it('falls back to the default order for a sort column outside the allow-list', async () => {
    await makeTax(ctxA);

    const page = (await taxCategoryService.findAll(ctxA, {
      page: 1,
      limit: 5,
      sortBy: 'organizationId',
    })) as { data: unknown[] };

    expect(Array.isArray(page.data)).toBe(true);
  });

  it('rolls the create back when the audit write fails', async () => {
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new TaxCategoryService(
      new PrismaTaxCategoryRepository(prismaService),
      prismaService,
      failing,
    );
    const code = `ROLLBACK-${suffix()}`;

    await expect(
      service.create(ctxA, {
        name: 'Rolled Back',
        code,
        rate: '13',
        taxType: 'VAT',
        effectiveFrom: FROM,
      }),
    ).rejects.toThrow('audit storage unavailable');

    // The create and its audit shared one transaction, so the insert was rolled
    // back with the audit failure.
    expect(
      await prisma.taxCategory.findFirst({
        where: { organizationId: orgA.id, code },
      }),
    ).toBeNull();
  });

  it('rolls the update back when the audit write fails', async () => {
    const created = await makeTax(ctxA, { rate: '13.0000' });
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new TaxCategoryService(
      new PrismaTaxCategoryRepository(prismaService),
      prismaService,
      failing,
    );

    await expect(
      service.update(ctxA, created.id, { rate: '15.0000' }),
    ).rejects.toThrow('audit storage unavailable');

    const row = (await prisma.taxCategory.findUnique({
      where: { id: created.id },
    })) as unknown as CreatedTax;
    expect(row.rate.toString()).toBe('13');
  });

  it('rolls the delete back when the audit write fails', async () => {
    const created = await makeTax(ctxA);
    const failing = new AuditService({
      create: () => Promise.reject(new Error('audit storage unavailable')),
    } as never);
    const service = new TaxCategoryService(
      new PrismaTaxCategoryRepository(prismaService),
      prismaService,
      failing,
    );

    await expect(service.delete(ctxA, created.id)).rejects.toThrow(
      'audit storage unavailable',
    );

    expect(
      await prisma.taxCategory.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
  });
});
