import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { OrganizationRepository } from './organization.repository.js';
import type { Organization } from '../generated/prisma/client.js';

@Injectable()
export class PrismaOrganizationRepository
  extends BaseRepository
  implements OrganizationRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  findById(id: string, tx?: PrismaTx): Promise<Organization | null> {
    return this.clientOrTx(tx).organization.findUnique({ where: { id } });
  }
}
