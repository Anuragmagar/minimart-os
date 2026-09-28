import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { StoreAccessRepository } from './store-access.repository.js';
import type { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

@Injectable()
export class PrismaStoreAccessRepository extends BaseRepository implements StoreAccessRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).userStoreAccess.findUnique({ where: { id } });
  }

  async findByUserAndStore(userId: string, storeId: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).userStoreAccess.findUnique({
      where: { userId_storeId: { userId, storeId } },
    });
  }

  async findAll(query: any, tx?: PrismaTx): Promise<any> {
    const client = this.clientOrTx(tx);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.storeId) {
      where.storeId = query.storeId;
    }

    const [data, total] = await Promise.all([
      this.clientOrTx(tx).userStoreAccess.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          store: { select: { id: true, name: true, code: true } },
        },
      }),
      this.clientOrTx(tx).userStoreAccess.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: { userId: string; storeId: string }, tx?: PrismaTx): Promise<any> {
    return this.clientOrTx(tx).userStoreAccess.create({ data });
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).userStoreAccess.delete({ where: { id } });
  }
}