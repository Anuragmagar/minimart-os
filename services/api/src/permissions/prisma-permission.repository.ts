import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { PermissionRepository } from './permission.repository.js';
import type { PermissionQueryDto } from './dto/permission-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { Permission } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set(['createdAt', 'updatedAt', 'code', 'status']);

function resolveOrderBy(
  query: PermissionQueryDto,
): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaPermissionRepository
  extends BaseRepository
  implements PermissionRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: string, tx?: PrismaTx): Promise<Permission | null> {
    return this.clientOrTx(tx).permission.findUnique({ where: { id } });
  }

  async findByCode(code: string, tx?: PrismaTx): Promise<Permission | null> {
    return this.clientOrTx(tx).permission.findUnique({ where: { code } });
  }

  async findAll(
    query: PermissionQueryDto,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Permission>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      client.permission.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
      }),
      client.permission.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<Permission>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<Permission> {
    return this.clientOrTx(tx).permission.create({
      data: data as never,
    }) as Promise<Permission>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<Permission> {
    return this.clientOrTx(tx).permission.update({
      where: { id },
      data: data as never,
    }) as Promise<Permission>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).permission.delete({ where: { id } });
  }
}
