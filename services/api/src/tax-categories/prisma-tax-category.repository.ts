import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { TaxCategoryRepository } from './tax-category.repository.js';
import type { TaxCategoryQueryDto } from './dto/tax-category-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { TaxCategory } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'code',
  'status',
  'effectiveFrom',
]);

/**
 * Rejects a client-chosen sort column that is not in the allow-list. Without
 * this, `sortBy` is an attacker-controlled key handed straight to Prisma.
 */
function resolveOrderBy(
  query: TaxCategoryQueryDto,
): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaTaxCategoryRepository
  extends BaseRepository
  implements TaxCategoryRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<TaxCategory | null> {
    return this.clientOrTx(tx).taxCategory.findFirst({
      where: { id, organizationId },
    });
  }

  async findByCode(
    code: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<TaxCategory | null> {
    return this.clientOrTx(tx).taxCategory.findFirst({
      where: { code, organizationId },
    });
  }

  async findAllInOrganization(
    query: TaxCategoryQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<TaxCategory>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };

    if (query.search) {
      // `search` matches either the display name or the short code, because a
      // user typing "VAT-STD" in a settings search box should find the standard
      // rate. The code is the field an operator tends to know by heart, and the
      // name is what they read on an invoice.
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      client.taxCategory.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      }),
      client.taxCategory.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<TaxCategory>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<TaxCategory> {
    return this.clientOrTx(tx).taxCategory.create({
      data: data as never,
    }) as Promise<TaxCategory>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<TaxCategory> {
    return this.clientOrTx(tx).taxCategory.update({
      where: { id },
      data: data as never,
    }) as Promise<TaxCategory>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).taxCategory.delete({ where: { id } });
  }
}
