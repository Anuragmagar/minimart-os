import type { PrismaTx } from '../database/prisma.service.js';
import type { Organization } from '../generated/prisma/client.js';

export abstract class OrganizationRepository {
  abstract findById(id: string, tx?: PrismaTx): Promise<Organization | null>;
}
