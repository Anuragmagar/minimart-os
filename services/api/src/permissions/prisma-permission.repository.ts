import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { PermissionRepository } from './permission.repository.js';
import type { PermissionQueryDto } from './dto/permission-query.dto.js';

@Injectable()
export class PrismaPermissionRepository extends BaseRepository implements PermissionRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).permission.findUnique({ where: { id } });
  }

  async findByCode(code: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).permission.findUnique({ where: { code } });
  }

  async findAll(query: any, tx?: PrismaTx): Promise<any> {
    const client = this.clientOrTx(tx);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

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
      this.clientOrTx(tx).permission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.clientOrTx(tx).permission.count({ where }),
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
    return this.clientOrTx(tx).permission.create({ data });
  }

  async update(id: string, data: any, tx?: PrismaTx): Promise<any> {
    return this.clientOrTx(tx).permission.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).permission.delete({ where: { id } });
  }
}