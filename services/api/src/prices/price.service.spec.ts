import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { TenantContext } from '../../common/auth/authenticated-user.js';
import type { PriceRepository } from './price.repository.js';
import type { ProductRepository } from '../../products/product.repository.js';
import { PriceService } from './price.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const PRICE_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const ctx: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  storeId: null,
  permissions: ['products:manage'],
};

const FROM = '2026-01-01T00:00:00.000Z';
const TO = '2026-07-01T00:00:00.000Z';

/** A stored row as Prisma returns it: the window as Date objects. */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: PRICE_ID,
    productId: PRODUCT_ID,
    priceType: 'retail',
    amount: '150',
    effectiveFrom: new Date(FROM),
    effectiveTo: null,
    createdAt: new Date(FROM),
    updatedAt: new Date(FROM),
    ...overrides,
  };
}

const validBody = {
  priceType: 'retail',
  amount: '150.00',
  effectiveFrom: FROM,
};

function createService(
  overrides: {
    findByIdInProduct?: ReturnType<typeof vi.fn>;
    findAllForProduct?: ReturnType<typeof vi.fn>;
    findOverlappingForType?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
    record?: ReturnType<typeof vi.fn>;
    findProduct?: ReturnType<typeof vi.fn>;
    runInTransaction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const mocks = {
    findByIdInProduct:
      overrides.findByIdInProduct ?? vi.fn().mockResolvedValue(stored()),
    findAllForProduct:
      overrides.findAllForProduct ?? vi.fn().mockResolvedValue([]),
    findOverlappingForType:
      overrides.findOverlappingForType ?? vi.fn().mockResolvedValue([]),
    create: overrides.create ?? vi.fn().mockResolvedValue(stored()),
    update: overrides.update ?? vi.fn().mockResolvedValue(stored()),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };

  const repository = mocks as unknown as PriceRepository;

  const record = overrides.record ?? vi.fn().mockResolvedValue({});
  const audit = { record } as unknown as AuditService;

  const findProduct =
    overrides.findProduct ??
    vi.fn().mockResolvedValue({ id: PRODUCT_ID, organizationId: ORG_ID });
  const productRepository = {
    findByIdInOrganization: findProduct,
  } as unknown as ProductRepository;

  const tx = { productPrice: {} } as unknown as PrismaTx;
  const runInTransaction = overrides.runInTransaction ?? vi.fn();
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );

  const prisma = { runInTransaction } as unknown as PrismaService;

  return {
    service: new PriceService(repository, productRepository, prisma, audit),
    repository,
    audit,
    prisma,
    runInTransaction,
    findProduct,
    findByIdInProduct: mocks.findByIdInProduct,
    findAllForProduct: mocks.findAllForProduct,
    findOverlappingForType: mocks.findOverlappingForType,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
    record,
    tx,
  };
}

describe('PriceService.create', () => {
  it('takes the product from the path and never from the payload', async () => {
    const { service, create, findProduct, tx } = createService();

    await service.create(ctx, PRODUCT_ID, {
      ...validBody,
      productId: OTHER_ORG_ID,
      organizationId: OTHER_ORG_ID,
    } as never);

    expect(findProduct).toHaveBeenCalledWith(PRODUCT_ID, ORG_ID, undefined);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT_ID }),
      tx,
    );
  });

  it('refuses a product from another organization before reading any price', async () => {
    const { service, findOverlappingForType, create } = createService({
      findProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.create(ctx, OTHER_ORG_ID, validBody),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findOverlappingForType).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('sends the amount to the repository as the string the payload carried', async () => {
    const { service, create, tx } = createService();

    await service.create(ctx, PRODUCT_ID, validBody);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '150.00' }),
      tx,
    );
  });

  it('writes and audits in one transaction', async () => {
    const { service, runInTransaction, create, record } = createService();

    await service.create(ctx, PRODUCT_ID, validBody);

    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product_price.create',
        entity: 'ProductPrice',
        entityId: PRICE_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
      expect.anything(),
    );
  });

  it('rejects a window whose end is not after its start', async () => {
    const { service, create } = createService();

    await expect(
      service.create(ctx, PRODUCT_ID, { ...validBody, effectiveTo: FROM }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a window that ends before it starts', async () => {
    const { service, create } = createService();

    await expect(
      service.create(ctx, PRODUCT_ID, {
        ...validBody,
        effectiveTo: '2025-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts a bounded window that ends after it starts', async () => {
    const { service, create } = createService();

    await service.create(ctx, PRODUCT_ID, { ...validBody, effectiveTo: TO });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveTo: new Date(TO) }),
      expect.anything(),
    );
  });

  it('refuses an overlapping period of the same price type', async () => {
    const { service, create } = createService({
      findOverlappingForType: vi.fn().mockResolvedValue([stored()]),
    });

    await expect(
      service.create(ctx, PRODUCT_ID, validBody),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('checks overlap inside the write transaction, not before it', async () => {
    const { service, findOverlappingForType, create, tx } = createService();

    await service.create(ctx, PRODUCT_ID, validBody);

    // The validation and the insert must not be interleavable by a concurrent
    // request, so both see the same transaction handle.
    expect(findOverlappingForType).toHaveBeenCalledWith(
      PRODUCT_ID,
      'retail',
      new Date(FROM),
      null,
      undefined,
      tx,
    );
    expect(create).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('accepts a null effectiveTo as an open-ended price', async () => {
    const { service, create, findOverlappingForType } = createService();

    await service.create(ctx, PRODUCT_ID, {
      ...validBody,
      effectiveTo: null,
    });

    expect(findOverlappingForType).toHaveBeenCalledWith(
      PRODUCT_ID,
      'retail',
      new Date(FROM),
      null,
      undefined,
      expect.anything(),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveTo: null }),
      expect.anything(),
    );
  });
});

describe('PriceService.update', () => {
  it('retires the period and audits before and after', async () => {
    const retired = stored({ effectiveTo: new Date(TO) });
    const { service, update, record, tx } = createService({
      update: vi.fn().mockResolvedValue(retired),
    });

    await service.update(ctx, PRODUCT_ID, PRICE_ID, { effectiveTo: TO });

    expect(update).toHaveBeenCalledWith(
      PRICE_ID,
      { effectiveTo: new Date(TO) },
      tx,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product_price.update',
        before: expect.objectContaining({ effectiveTo: null }),
        after: expect.objectContaining({ effectiveTo: new Date(TO) }),
      }),
      tx,
    );
  });

  it('leaves the stored value alone when effectiveTo is omitted', async () => {
    const { service, update, record } = createService();

    const result = await service.update(ctx, PRODUCT_ID, PRICE_ID, {});

    expect(update).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('rejects a retirement at or before the period start', async () => {
    const { service, update } = createService();

    await expect(
      service.update(ctx, PRODUCT_ID, PRICE_ID, { effectiveTo: FROM }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a retirement that would overlap a successor', async () => {
    const { service, update } = createService({
      findOverlappingForType: vi.fn().mockResolvedValue([stored()]),
    });

    await expect(
      service.update(ctx, PRODUCT_ID, PRICE_ID, { effectiveTo: TO }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('excludes its own row from the overlap check', async () => {
    const { service, findOverlappingForType } = createService();

    await service.update(ctx, PRODUCT_ID, PRICE_ID, { effectiveTo: TO });

    expect(findOverlappingForType).toHaveBeenCalledWith(
      PRODUCT_ID,
      'retail',
      new Date(FROM),
      new Date(TO),
      PRICE_ID,
      expect.anything(),
    );
  });

  it('reopens a period when effectiveTo is explicitly null and nothing claims the time', async () => {
    const { service, update } = createService();

    await service.update(ctx, PRODUCT_ID, PRICE_ID, { effectiveTo: null });

    expect(update).toHaveBeenCalledWith(
      PRICE_ID,
      { effectiveTo: null },
      expect.anything(),
    );
  });

  it('refuses to reopen a period a successor already claims', async () => {
    const { service, update } = createService({
      findOverlappingForType: vi.fn().mockResolvedValue([stored()]),
    });

    await expect(
      service.update(ctx, PRODUCT_ID, PRICE_ID, { effectiveTo: null }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a missing price when the id belongs to no visible row', async () => {
    const { service, update } = createService({
      findByIdInProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(ctx, PRODUCT_ID, PRICE_ID, { effectiveTo: TO }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a missing product rather than a missing price for a foreign product', async () => {
    const { service, findByIdInProduct } = createService({
      findProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(ctx, OTHER_ORG_ID, PRICE_ID, { effectiveTo: TO }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findByIdInProduct).not.toHaveBeenCalled();
  });
});

describe('PriceService.delete', () => {
  it('deletes and audits a period that has not started', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const {
      service,
      delete: del,
      record,
      tx,
    } = createService({
      findByIdInProduct: vi
        .fn()
        .mockResolvedValue(stored({ effectiveFrom: new Date(future) })),
    });

    await service.delete(ctx, PRODUCT_ID, PRICE_ID);

    expect(del).toHaveBeenCalledWith(PRICE_ID, tx);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product_price.delete',
        before: expect.objectContaining({ effectiveTo: null }),
      }),
      tx,
    );
  });

  it('refuses to delete a price that has already taken effect', async () => {
    const { service, delete: del } = createService({
      findByIdInProduct: vi
        .fn()
        .mockResolvedValue(stored({ effectiveFrom: new Date(FROM) })),
    });

    await expect(
      service.delete(ctx, PRODUCT_ID, PRICE_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(del).not.toHaveBeenCalled();
  });

  it('treats a period starting exactly now as already in effect', async () => {
    const { service, delete: del } = createService({
      findByIdInProduct: vi
        .fn()
        .mockResolvedValue(stored({ effectiveFrom: new Date() })),
    });

    await expect(
      service.delete(ctx, PRODUCT_ID, PRICE_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(del).not.toHaveBeenCalled();
  });

  it('reports a missing price before deciding anything about the window', async () => {
    const { service, delete: del } = createService({
      findByIdInProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.delete(ctx, PRODUCT_ID, PRICE_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('PriceService reads', () => {
  it('scopes the listing to the product and the caller organization', async () => {
    const { service, findAllForProduct } = createService();

    await service.findAll(ctx, PRODUCT_ID, {} as never);

    expect(findAllForProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT_ID,
        organizationId: ORG_ID,
        take: 20,
        skip: 0,
      }),
      undefined,
    );
  });

  it('applies the declared default page size to the window, not only the offset', async () => {
    const { service, findAllForProduct } = createService();

    // Without this, an unbounded page would be read while the offset still
    // assumed a size of twenty.
    await service.findAll(ctx, PRODUCT_ID, { page: 3 } as never);

    expect(findAllForProduct).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, skip: 40 }),
      undefined,
    );
  });

  it('turns effectiveOn into a Date and passes priceType through', async () => {
    const { service, findAllForProduct } = createService();

    await service.findAll(ctx, PRODUCT_ID, {
      priceType: 'retail',
      effectiveOn: TO,
    } as never);

    expect(findAllForProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        priceType: 'retail',
        effectiveOn: new Date(TO),
      }),
      undefined,
    );
  });

  it('computes the offset from the requested page', async () => {
    const { service, findAllForProduct } = createService();

    await service.findAll(ctx, PRODUCT_ID, { page: 3, limit: 10 } as never);

    expect(findAllForProduct).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 }),
      undefined,
    );
  });

  it('refuses to list the prices of a product in another organization', async () => {
    const { service, findAllForProduct } = createService({
      findProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.findAll(ctx, OTHER_ORG_ID, {} as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findAllForProduct).not.toHaveBeenCalled();
  });

  it('reads one price only through a visible product', async () => {
    const { service, findByIdInProduct } = createService();

    await service.findById(ctx, PRODUCT_ID, PRICE_ID);

    expect(findByIdInProduct).toHaveBeenCalledWith(
      PRICE_ID,
      PRODUCT_ID,
      ORG_ID,
      undefined,
    );
  });
});
