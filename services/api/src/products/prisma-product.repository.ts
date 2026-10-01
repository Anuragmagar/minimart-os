import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { ProductRepository } from './product.repository.js';
import type { ProductQueryDto } from './dto/product-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { Product } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'sku',
  'status',
]);

/**
 * Rejects a client-chosen sort column that is not in the allow-list. Without
 * this, `sortBy` is an attacker-controlled key handed straight to Prisma, and
 * `organizationId` would let a caller order rows by tenant. The list carries no
 * per-row reference counts: nothing inside the product module points at a
 * product, and the ten child tables that block a delete are all owned by later
 * phases.
 */
function resolveOrderBy(
  query: ProductQueryDto,
): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

/**
 * The four parents are joined so a catalog row renders without a second request
 * per row. Only display fields are selected: no tax rate (owned by Task 05.07)
 * and no inventory quantity, because inventory is a ledger projection and must
 * never be read off a product row (AGENTS.md 14).
 */
const PARENT_SELECT = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  unit: { select: { id: true, code: true, precision: true } },
  taxCategory: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class PrismaProductRepository
  extends BaseRepository
  implements ProductRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Product | null> {
    return this.clientOrTx(tx).product.findFirst({
      where: { id, organizationId },
    });
  }

  async findBySku(
    sku: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Product | null> {
    return this.clientOrTx(tx).product.findFirst({
      where: { sku, organizationId },
    });
  }

  async findAllInOrganization(
    query: ProductQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Product>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };

    if (query.search) {
      // `search` matches the display name or the SKU, because a user typing
      // "COK-500" into a catalog search box expects to find the product just as
      // much as one typing "Coca-Cola". Barcode search is deliberately absent:
      // barcodes are Task 05.06 and no product row owns one.
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      client.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: PARENT_SELECT,
      }),
      client.product.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<Product>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<Product> {
    return this.clientOrTx(tx).product.create({
      data: data as never,
    }) as Promise<Product>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<Product> {
    return this.clientOrTx(tx).product.update({
      where: { id },
      data: data as never,
    }) as Promise<Product>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).product.delete({ where: { id } });
  }
}
