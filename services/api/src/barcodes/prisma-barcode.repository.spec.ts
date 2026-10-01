import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService, PrismaTx } from '../database/prisma.service.js';
import { PrismaBarcodeRepository } from './prisma-barcode.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PRODUCT_ID = '99999999-9999-4999-8999-999999999999';
const BARCODE_ID = '44444444-4444-4444-8444-444444444444';

type BarcodeDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

function createRepository(overrides: Partial<BarcodeDelegate> = {}) {
  const productBarcode: BarcodeDelegate = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: BARCODE_ID }),
    update: vi.fn().mockResolvedValue({ id: BARCODE_ID }),
    delete: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  };
  const prisma = {
    client: { productBarcode },
  } as unknown as PrismaService;
  return { repository: new PrismaBarcodeRepository(prisma), productBarcode };
}

describe('PrismaBarcodeRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes a lookup by id to the product and the organization', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.findByIdInProduct(BARCODE_ID, PRODUCT_ID, ORG_ID);

    // All three predicates are present, so a barcode of a sibling product inside
    // the same organization is not returned.
    expect(productBarcode.findFirst).toHaveBeenCalledWith({
      where: { id: BARCODE_ID, productId: PRODUCT_ID, organizationId: ORG_ID },
    });
  });

  it('scopes a value lookup to the organization and not to a product', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.findByValue('5000112637922', ORG_ID);

    // Uniqueness is per organization: the conflicting row may belong to any
    // product, so no product predicate may narrow this lookup.
    expect(productBarcode.findFirst).toHaveBeenCalledWith({
      where: { barcode: '5000112637922', organizationId: ORG_ID },
    });
    expect(productBarcode.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      'productId',
    );
  });

  it('constrains the collection to the product and the organization', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.findAllForProduct(PRODUCT_ID, ORG_ID);

    expect(productBarcode.findMany).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID, organizationId: ORG_ID },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('returns the whole collection rather than one page of it', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.findAllForProduct(PRODUCT_ID, ORG_ID);

    const args = productBarcode.findMany.mock.calls[0][0];
    expect(args).not.toHaveProperty('skip');
    expect(args).not.toHaveProperty('take');
  });

  it('reads through the transaction client when one is supplied', async () => {
    const { repository, productBarcode } = createRepository();
    const tx = { productBarcode } as unknown as PrismaTx;

    await repository.findAllForProduct(PRODUCT_ID, ORG_ID, tx);

    expect(productBarcode.findMany).toHaveBeenCalled();
  });

  it('creates through the transaction client when one is supplied', async () => {
    const { repository, productBarcode } = createRepository();
    const tx = { productBarcode } as unknown as PrismaTx;

    await repository.create(
      {
        organizationId: ORG_ID,
        productId: PRODUCT_ID,
        barcode: '5000112637922',
      },
      tx,
    );

    expect(productBarcode.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG_ID,
        productId: PRODUCT_ID,
        barcode: '5000112637922',
      },
    });
  });

  it('updates by id only, leaving tenant scoping to the service', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.update(BARCODE_ID, { isPrimary: true });

    expect(productBarcode.update).toHaveBeenCalledWith({
      where: { id: BARCODE_ID },
      data: { isPrimary: true },
    });
  });

  it('deletes by id', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.delete(BARCODE_ID);

    expect(productBarcode.delete).toHaveBeenCalledWith({
      where: { id: BARCODE_ID },
    });
  });

  it('demotes only the primary rows of that product and organization', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.demotePrimary(PRODUCT_ID, ORG_ID);

    expect(productBarcode.updateMany).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID, organizationId: ORG_ID, isPrimary: true },
      data: { isPrimary: false },
    });
  });

  it('clears the flag instead of removing the rows', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.demotePrimary(PRODUCT_ID, ORG_ID);

    // A demotion must not delete a barcode: the value stays usable, it just
    // stops being the one the catalog prints first.
    expect(productBarcode.delete).not.toHaveBeenCalled();
    expect(
      JSON.stringify(productBarcode.updateMany.mock.calls[0][0].data),
    ).not.toContain('barcode');
  });

  it('cannot demote a primary of another product or organization', async () => {
    const { repository, productBarcode } = createRepository();

    await repository.demotePrimary(OTHER_PRODUCT_ID, OTHER_ORG_ID);

    expect(productBarcode.updateMany).toHaveBeenCalledWith({
      where: {
        productId: OTHER_PRODUCT_ID,
        organizationId: OTHER_ORG_ID,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  });
});
