import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../database/prisma.service.js';
import type { AuditLog } from '../generated/prisma/client.js';
import { sanitizeForAudit } from './audit-sanitizer.js';
import { AuditRepository, type AuditLogParams } from './audit.repository.js';

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  record(entry: AuditLogParams, tx?: PrismaTx): Promise<AuditLog> {
    return this.repository.create(
      {
        ...entry,
        before:
          entry.before === undefined
            ? undefined
            : sanitizeForAudit(entry.before),
        after:
          entry.after === undefined ? undefined : sanitizeForAudit(entry.after),
      },
      tx,
    );
  }
}
