import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { UserRepository } from './user.repository.js';
import type { UserQueryDto } from './dto/user-query.dto.js';
import type { PaginatedResponseDto } from './dto/paginated-response.dto.js';
import type { User } from '../generated/prisma/client.js';

const SORTABLE_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'email',
  'status',
  'lastLogin',
]);

/**
 * Rejects a client-chosen sort column that is not in the allow-list. Without
 * this, `sortBy` is an attacker-controlled key handed to Prisma.
 */
function resolveOrderBy(query: UserQueryDto): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

@Injectable()
export class PrismaUserRepository
  extends BaseRepository
  implements UserRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<User | null> {
    return this.clientOrTx(tx).user.findFirst({
      where: { id, organizationId },
    });
  }

  async findByEmail(email: string, tx?: PrismaTx): Promise<User | null> {
    return this.clientOrTx(tx).user.findUnique({ where: { email } });
  }

  async findAllInOrganization(
    query: UserQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<User>> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // organizationId is part of the same where clause as every other filter, so
    // it cannot be dropped by a caller-supplied filter.
    const where: Record<string, unknown> = { organizationId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.roleId) {
      where.roles = { some: { roleId: query.roleId } };
    }

    if (query.storeId) {
      where.storeAccess = { some: { storeId: query.storeId } };
    }

    if (query.status) {
      where.status = query.status;
    }

    const orderBy = resolveOrderBy(query);

    const [data, total] = await Promise.all([
      client.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          roles: { include: { role: true } },
          storeAccess: { include: { store: true } },
        },
      }),
      client.user.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginatedResponseDto<User>;
  }

  async create(data: unknown, tx?: PrismaTx): Promise<User> {
    return this.clientOrTx(tx).user.create({
      data: data as never,
    }) as Promise<User>;
  }

  async update(id: string, data: unknown, tx?: PrismaTx): Promise<User> {
    return this.clientOrTx(tx).user.update({
      where: { id },
      data: data as never,
    }) as Promise<User>;
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).user.delete({ where: { id } });
  }
}
