import type { PrismaTx } from '../database/prisma.service.js';
import type { AuditLog } from '../generated/prisma/client.js';

export interface AuditLogParams {
  organizationId: string;
  storeId?: string;
  userId?: string;
  deviceId?: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export abstract class AuditRepository {
  abstract create(entry: AuditLogParams, tx?: PrismaTx): Promise<AuditLog>;
}
