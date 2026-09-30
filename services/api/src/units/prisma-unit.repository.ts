import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { UnitRepository } from './unit.repository.js';
import type { UnitQueryDto } from './dto/unit-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { Unit } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'code',
  'status',
]);

/**
 * Rejects a client-chosen sort column that is not in the allow-list. Without
 * this, `sortBy` is an attacker-controlled key handed straight to Prisma.
 */
function resolveOrderBy(query: UnitQueryDto): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaUnitRepository
  extends BaseRepository
  implements UnitRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Unit | null> {
    return this.clientOrTx(tx).unit.findFirst({
      where: { id, organizationId },
    });
  }

  async findByCode(
    code: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Unit | null> {
    return this.clientOrTx(tx).unit.findFirst({
      where: { code, organizationId },
    });
  }

  async findAllInOrganization(
    query: UnitQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Unit>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };

    if (query.search) {
      // `search` matches either the display name or the short code, because a
      // user typing "KG" in a catalog search box should find the kilogram.
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      client.unit.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: {
          _count: {
            select: {
              products: true,
              conversionsFrom: true,
              conversionsTo: true,
            },
          },
        },
      }),
      client.unit.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<Unit>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<Unit> {
    return this.clientOrTx(tx).unit.create({
      data: data as never,
    }) as Promise<Unit>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<Unit> {
    return this.clientOrTx(tx).unit.update({
      where: { id },
      data: data as never,
    }) as Promise<Unit>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).unit.delete({ where: { id } });
  }
}
