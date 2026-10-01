import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import {
  PriceRepository,
  CreatePriceData,
  UpdatePriceData,
  PriceListParams,
} from './price.repository.js';
import { Prisma, type ProductPrice } from '../generated/prisma/client.js';

@Injectable()
export class PrismaPriceRepository
  extends BaseRepository
  implements PriceRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * `product_prices` carries no organization column: the tenant is reached
   * through `productId`, so the read is scoped by the parent product's
   * organization exactly as the write path is. A price row therefore cannot be
   * read without its own product being visible to the caller, which is what keeps
   * one organization from probing another's price history (BR-040).
   */
  async findByIdInProduct(
    id: string,
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductPrice | null> {
    return this.clientOrTx(tx).productPrice.findFirst({
      where: { id, productId, product: { organizationId } },
    });
  }

  async findAllForProduct(
    params: PriceListParams,
    tx?: PrismaTx,
  ): Promise<ProductPrice[]> {
    const {
      productId,
      organizationId,
      priceType,
      effectiveOn,
      orderBy = 'effectiveFrom',
      orderDir = 'desc',
      take,
      skip,
    } = params;

    const where: Prisma.ProductPriceWhereInput = {
      productId,
      product: { organizationId },
      ...(priceType === undefined ? {} : { priceType }),
    };

    // `effectiveOn` answers "what was this price on that instant" rather than
    // "what is in force now", which is the same half-open interval test the
    // overlap check uses: the period must have started, and must not have ended
    // at or before the instant.
    if (effectiveOn !== undefined) {
      where.AND = [
        { effectiveFrom: { lte: effectiveOn } },
        {
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveOn } }],
        },
      ];
    }

    return this.clientOrTx(tx).productPrice.findMany({
      where,
      orderBy: [{ [orderBy]: orderDir }, { createdAt: 'desc' }],
      take,
      skip,
    });
  }

  /**
   * Overlap is enforced in the application because Prisma cannot express a
   * PostgreSQL exclusion constraint (ASM-015(e)). The candidate rows are read
   * through the `(productId, priceType, effectiveFrom)` index so the check stays
   * cheap, then the intersection is decided here.
   *
   * Windows are half-open, `[effectiveFrom, effectiveTo)`, so they intersect
   * exactly when each one starts before the other one ends. A null `effectiveTo`
   * is an open end, compared as positive infinity, which is what makes retiring
   * the current price at the instant its successor starts a legal transition
   * rather than a conflict.
   */
  async findOverlappingForType(
    productId: string,
    priceType: string,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId: string | undefined,
    tx?: PrismaTx,
  ): Promise<ProductPrice[]> {
    const candidates = await this.clientOrTx(tx).productPrice.findMany({
      where: {
        productId,
        priceType,
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
      },
      orderBy: { effectiveFrom: 'asc' },
    });

    const start = effectiveFrom.getTime();
    const end = effectiveTo === null ? Infinity : effectiveTo.getTime();

    return candidates.filter((candidate) => {
      const candidateEnd =
        candidate.effectiveTo === null
          ? Infinity
          : candidate.effectiveTo.getTime();
      return start < candidateEnd && candidate.effectiveFrom.getTime() < end;
    });
  }

  async create(data: CreatePriceData, tx?: PrismaTx): Promise<ProductPrice> {
    return this.clientOrTx(tx).productPrice.create({
      data: {
        productId: data.productId,
        priceType: data.priceType,
        amount: new Prisma.Decimal(data.amount),
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
      },
    });
  }

  async update(
    id: string,
    data: UpdatePriceData,
    tx?: PrismaTx,
  ): Promise<ProductPrice> {
    // `!== undefined` rather than a truthiness test, so an explicit null is
    // written through and reopens the period. Only effectiveTo appears here at
    // all: the amount, the price type and the start of the window are not in
    // `UpdatePriceData`, so this method cannot reach them.
    const patch: { effectiveTo?: Date | null } = {};
    if (data.effectiveTo !== undefined) {
      patch.effectiveTo = data.effectiveTo;
    }

    return this.clientOrTx(tx).productPrice.update({
      where: { id },
      data: patch,
    });
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).productPrice.delete({ where: { id } });
  }
}
