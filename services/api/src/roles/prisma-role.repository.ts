import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { RoleRepository } from './role.repository.js';
import type { RoleQueryDto } from './dto/role-query.dto.js';

@Injectable()
export class PrismaRoleRepository extends BaseRepository implements RoleRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).role.findUnique({ where: { id } });
  }

  async findByCode(code: string, organizationId: string, tx?: PrismaTx): Promise<any | null> {
    return this.clientOrTx(tx).role.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code,
        },
      },
    });
  }

  async findAll(query: any, tx?: PrismaTx): Promise<any> {
    const client = this.clientOrTx(tx);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

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
      this.clientOrTx(tx).role.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        include: {
          _count: {
            select: { users: true, permissions: true },
          },
        },
      }),
      this.clientOrTx(tx).role.count({ where }),
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
    return this.clientOrTx(tx).role.create({ data });
  }

  async update(id: string, data: any, tx?: PrismaTx): Promise<any> {
    return this.clientOrTx(tx).role.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, tx?: PrismaTx): Promise<void> {
    await this.clientOrTx(tx).role.delete({ where: { id } });
  }
}