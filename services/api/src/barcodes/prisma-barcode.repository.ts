import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { BarcodeRepository } from './barcode.repository.js';
import type { ProductBarcode } from '../generated/prisma/client.js';

@Injectable()
export class PrismaBarcodeRepository
  extends BaseRepository
  implements BarcodeRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInProduct(
    id: string,
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductBarcode | null> {
    return this.clientOrTx(tx).productBarcode.findFirst({
      where: { id, productId, organizationId },
    });
  }

  async findByValue(
    barcode: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductBarcode | null> {
    return this.clientOrTx(tx).productBarcode.findFirst({
      where: { barcode, organizationId },
    });
  }

  async findAllForProduct(
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductBarcode[]> {
    return this.clientOrTx(tx).productBarcode.findMany({
      where: { productId, organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: unknown, tx?: PrismaTx): Promise<ProductBarcode> {
    return this.clientOrTx(tx).productBarcode.create({
      data: data as never,
    }) as Promise<ProductBarcode>;
  }

  async update(
    id: string,
    data: unknown,
    tx?: PrismaTx,
  ): Promise<ProductBarcode> {
    return this.clientOrTx(tx).productBarcode.update({
      where: { id },
      data: data as never,
    }) as Promise<ProductBarcode>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).productBarcode.delete({ where: { id } });
  }

  async demotePrimary(
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    await this.clientOrTx(tx).productBarcode.updateMany({
      where: { productId, organizationId, isPrimary: true },
      data: { isPrimary: false },
    });
  }
}
