import type { PrismaTx } from '../database/prisma.service.js';
import type { ProductPrice } from '../generated/prisma/client.js';

export interface CreatePriceData {
  productId: string;
  priceType: string;
  amount: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface UpdatePriceData {
  effectiveTo?: Date | null;
}

export interface PriceListParams {
  productId: string;
  organizationId: string;
  priceType?: string;
  effectiveOn?: Date;
  orderBy?: 'effectiveFrom' | 'createdAt';
  orderDir?: 'asc' | 'desc';
  take?: number;
  skip?: number;
}

export const PriceRepository = Symbol('PriceRepository');

export interface PriceRepository {
  findByIdInProduct(
    id: string,
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductPrice | null>;
  findAllForProduct(
    params: PriceListParams,
    tx?: PrismaTx,
  ): Promise<ProductPrice[]>;
  findOverlappingForType(
    productId: string,
    priceType: string,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId: string | undefined,
    tx?: PrismaTx,
  ): Promise<ProductPrice[]>;
  create(data: CreatePriceData, tx?: PrismaTx): Promise<ProductPrice>;
  update(
    id: string,
    data: UpdatePriceData,
    tx?: PrismaTx,
  ): Promise<ProductPrice>;
  delete(id: string, tx?: PrismaTx): Promise<void>;
}
