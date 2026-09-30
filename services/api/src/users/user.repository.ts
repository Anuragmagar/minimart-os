import type { PrismaTx } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import type { UserQueryDto } from './dto/user-query.dto.js';
import type { PaginatedResponseDto } from './dto/paginated-response.dto.js';

/**
 * Every read method takes the caller's organizationId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument (AGENTS.md 13, BR-040).
 */
export abstract class UserRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<User | null>;
  /** Email is globally unique in the schema, so this lookup is not org-scoped.
   * It exists for credential login and email-collision checks only. */
  abstract findByEmail(email: string, tx?: PrismaTx): Promise<User | null>;
  abstract findAllInOrganization(
    query: UserQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<User>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<User>;
  abstract update(id: string, data: unknown, tx?: PrismaTx): Promise<User>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
