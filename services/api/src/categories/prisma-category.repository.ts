import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { CategoryRepository } from './category.repository.js';
import type { CategoryQueryDto } from './dto/category-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { Category } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set(['createdAt', 'updatedAt', 'name', 'status']);

/**
 * Rejects a client-chosen sort column that is not in the allow-list. Without
 * this, `sortBy` is an attacker-controlled key handed straight to Prisma.
 */
function resolveOrderBy(
  query: CategoryQueryDto,
): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaCategoryRepository
  extends BaseRepository
  implements CategoryRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Category | null> {
    return this.clientOrTx(tx).category.findFirst({
      where: { id, organizationId },
    });
  }

  async findByName(
    name: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Category | null> {
    return this.clientOrTx(tx).category.findFirst({
      where: { name, organizationId },
    });
  }

  async findParentIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<string | null> {
    const category = await this.clientOrTx(tx).category.findFirst({
      where: { id, organizationId },
      select: { parentId: true },
    });
    return category?.parentId ?? null;
  }

  async findAllInOrganization(
    query: CategoryQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Category>> {
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

    if (query.parentId) {
      where.parentId = query.parentId;
    }

    const [data, total] = await Promise.all([
      client.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: { _count: { select: { products: true, children: true } } },
      }),
      client.category.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<Category>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<Category> {
    return this.clientOrTx(tx).category.create({
      data: data as never,
    }) as Promise<Category>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<Category> {
    return this.clientOrTx(tx).category.update({
      where: { id },
      data: data as never,
    }) as Promise<Category>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).category.delete({ where: { id } });
  }
}
