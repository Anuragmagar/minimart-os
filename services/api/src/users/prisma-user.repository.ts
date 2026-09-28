import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { UserRepository } from './user.repository.js';
import type { UserQueryDto } from './dto/user-query.dto.js';
import type { PaginatedResponseDto } from './dto/paginated-response.dto.js';

@Injectable()
export class PrismaUserRepository extends BaseRepository implements UserRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).user.findUnique({ where: { id } });
  }

  async findByEmail(email: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).user.findUnique({ where: { email } });
  }

  async findAll(query: UserQueryDto, tx?: PrismaTx): Promise<any> {
    const client = this.clientOrTx(tx);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.roleId) {
      where.roles = {
        some: { roleId: query.roleId },
      };
    }

    if (query.storeId) {
      where.storeAccess = {
        some: { storeId: query.storeId },
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.clientOrTx(tx).user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        include: {
          roles: {
            include: { role: true },
          },
          storeAccess: {
            include: { store: true },
          },
        },
      }),
      this.clientOrTx(tx).user.count({ where }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: any, tx?: PrismaTx): Promise<any> {
    return this.clientOrTx(tx).user.create({ data });
  }

  async update(id: string, data: any, tx?: PrismaTx): Promise<any> {
    return this.clientOrTx(tx).user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).user.delete({ where: { id } });
  }
}