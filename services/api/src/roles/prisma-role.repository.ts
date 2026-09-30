import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { RoleRepository } from './role.repository.js';
import type { RoleQueryDto } from './dto/role-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';
import type { Role } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'code',
  'status',
]);

function resolveOrderBy(query: RoleQueryDto): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaRoleRepository
  extends BaseRepository
  implements RoleRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Role | null> {
    return this.clientOrTx(tx).role.findFirst({
      where: { id, organizationId },
    });
  }

  async findByCode(
    code: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Role | null> {
    return this.clientOrTx(tx).role.findFirst({
      where: { code, organizationId },
    });
  }

  async findAllInOrganization(
    query: RoleQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Role>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      client.role.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: { _count: { select: { users: true, permissions: true } } },
      }),
      client.role.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<Role>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<Role> {
    return this.clientOrTx(tx).role.create({
      data: data as never,
    }) as Promise<Role>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<Role> {
    return this.clientOrTx(tx).role.update({
      where: { id },
      data: data as never,
    }) as Promise<Role>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).role.delete({ where: { id } });
  }
}
