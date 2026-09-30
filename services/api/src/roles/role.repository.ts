import type { PrismaTx } from '../database/prisma.service.js';
import type { Role } from '../generated/prisma/client.js';
import type { RoleQueryDto } from './dto/role-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/** Organization scope is always supplied by the caller's tenant context. */
export abstract class RoleRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Role | null>;
  abstract findByCode(
    code: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Role | null>;
  abstract findAllInOrganization(
    query: RoleQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Role>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<Role>;
  abstract update(id: string, data: unknown, tx?: PrismaTx): Promise<Role>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
