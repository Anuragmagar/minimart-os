import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../database/base.repository.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { AuditRepository, type AuditLogParams } from './audit.repository.js';
import type { AuditLog } from '../generated/prisma/client.js';

@Injectable()
export class PrismaAuditRepository
  extends BaseRepository
  implements AuditRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  create(entry: AuditLogParams, tx?: PrismaTx): Promise<AuditLog> {
    return this.clientOrTx(tx).auditLog.create({
      data: {
        organizationId: entry.organizationId,
        storeId: entry.storeId ?? null,
        userId: entry.userId ?? null,
        deviceId: entry.deviceId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before:
          entry.before === undefined
            ? Prisma.DbNull
            : (entry.before as Prisma.InputJsonValue),
        after:
          entry.after === undefined
            ? Prisma.DbNull
            : (entry.after as Prisma.InputJsonValue),
      },
    });
  }
}
