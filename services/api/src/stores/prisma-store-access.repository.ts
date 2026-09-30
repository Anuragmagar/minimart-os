import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import {
  StoreAccessRepository,
  type StoreAccessRecord,
  type StoreAccessWithRelations,
} from './store-access.repository.js';
import type { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

const SORTABLE_COLUMNS = new Set(['createdAt', 'userId', 'storeId']);

function resolveOrderBy(
  query: StoreAccessQueryDto,
): Record<string, 'asc' | 'desc'> {
  const column =
    query.sortBy && SORTABLE_COLUMNS.has(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  return { [column]: query.sortOrder ?? 'desc' };
}

const WITH_RELATIONS = {
  user: { select: { id: true, name: true, email: true } },
  store: { select: { id: true, name: true, code: true } },
} as const;

@Injectable()
export class PrismaStoreAccessRepository
  extends BaseRepository
  implements StoreAccessRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<StoreAccessRecord | null> {
    return this.clientOrTx(tx).userStoreAccess.findFirst({
      where: { id, user: { organizationId } },
    });
  }

  async findByUserAndStore(
    userId: string,
    storeId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<StoreAccessRecord | null> {
    return this.clientOrTx(tx).userStoreAccess.findFirst({
      where: { userId, storeId, user: { organizationId } },
    });
  }

  async findAllInOrganization(
    query: StoreAccessQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<{
    data: StoreAccessWithRelations[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const client = this.clientOrTx(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { user: { organizationId } };

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.storeId) {
      where.storeId = query.storeId;
    }

    const [data, total] = await Promise.all([
      client.userStoreAccess.findMany({
        where,
        skip,
        take: limit,
        orderBy: resolveOrderBy(query),
        include: WITH_RELATIONS,
      }),
      client.userStoreAccess.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(
    data: { userId: string; storeId: string },
    tx?: PrismaTx,
  ): Promise<StoreAccessRecord> {
    return this.clientOrTx(tx).userStoreAccess.create({ data });
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).userStoreAccess.delete({ where: { id } });
  }
}
