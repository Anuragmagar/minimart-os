import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { UnitConversionRepository } from './unit-conversion.repository.js';
import type { UnitConversionQueryDto } from './dto/unit-conversion-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { UnitConversion } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set(['createdAt', 'updatedAt', 'multiplier']);

/**
 * The two unit columns are joined so a caller can render "1 DOZ = 12 PCS"
 * without a second request per row. Only the catalog fields are selected; no
 * financial or stock column is read here.
 */
const UNIT_SELECT = {
  id: true,
  name: true,
  code: true,
  precision: true,
  status: true,
} as const;

/**
 * Rejects a client-chosen sort column that is not in the allow-list. Without
 * this, `sortBy` is an attacker-controlled key handed straight to Prisma, and
 * `organizationId` would let a caller order rows by tenant.
 */
function resolveOrderBy(
  query: UnitConversionQueryDto,
): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaUnitConversionRepository
  extends BaseRepository
  implements UnitConversionRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<UnitConversion | null> {
    return this.clientOrTx(tx).unitConversion.findFirst({
      where: { id, organizationId },
    });
  }

  async findByDirection(
    fromUnitId: string,
    toUnitId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<UnitConversion | null> {
    return this.clientOrTx(tx).unitConversion.findFirst({
      where: { fromUnitId, toUnitId, organizationId },
    });
  }

  async findAllInOrganization(
    query: UnitConversionQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<UnitConversion>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (query.fromUnitId) {
      where.fromUnitId = query.fromUnitId;
    }
    if (query.toUnitId) {
      where.toUnitId = query.toUnitId;
    }

    const [data, total] = await Promise.all([
      client.unitConversion.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: {
          fromUnit: { select: UNIT_SELECT },
          toUnit: { select: UNIT_SELECT },
        },
      }),
      client.unitConversion.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<UnitConversion>;
  }

  async findOutgoingEdges(
    fromUnitIds: string[],
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Array<{ fromUnitId: string; toUnitId: string }>> {
    if (fromUnitIds.length === 0) {
      return [];
    }
    return this.clientOrTx(tx).unitConversion.findMany({
      where: { fromUnitId: { in: fromUnitIds }, organizationId },
      select: { fromUnitId: true, toUnitId: true },
    });
  }

  async create(data: unknown, tx?: PrismaTx): Promise<UnitConversion> {
    return this.clientOrTx(tx).unitConversion.create({
      data: data as never,
    }) as Promise<UnitConversion>;
  }

  async update(
    id: string,
    data: unknown,
    tx?: PrismaTx,
  ): Promise<UnitConversion> {
    return this.clientOrTx(tx).unitConversion.update({
      where: { id },
      data: data as never,
    }) as Promise<UnitConversion>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).unitConversion.delete({ where: { id } });
  }
}
