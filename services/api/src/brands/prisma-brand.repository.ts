import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { BrandRepository } from './brand.repository.js';
import type { BrandQueryDto } from './dto/brand-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { Brand } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set(['createdAt', 'updatedAt', 'name', 'status']);

/**
 * Rejects a client-chosen sort column that is not in the allow-list. Without
 * this, `sortBy` is an attacker-controlled key handed straight to Prisma.
 */
function resolveOrderBy(query: BrandQueryDto): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaBrandRepository
  extends BaseRepository
  implements BrandRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Brand | null> {
    return this.clientOrTx(tx).brand.findFirst({
      where: { id, organizationId },
    });
  }

  async findByName(
    name: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Brand | null> {
    return this.clientOrTx(tx).brand.findFirst({
      where: { name, organizationId },
    });
  }

  async findAllInOrganization(
    query: BrandQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Brand>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      client.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: { _count: { select: { products: true } } },
      }),
      client.brand.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<Brand>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<Brand> {
    return this.clientOrTx(tx).brand.create({
      data: data as never,
    }) as Promise<Brand>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<Brand> {
    return this.clientOrTx(tx).brand.update({
      where: { id },
      data: data as never,
    }) as Promise<Brand>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).brand.delete({ where: { id } });
  }
}
