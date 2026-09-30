import type { PrismaTx } from '../database/prisma.service.js';
import type { Permission } from '../generated/prisma/client.js';
import type { PermissionQueryDto } from './dto/permission-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/** The permission catalog is global: Permission has no organizationId. */
export abstract class PermissionRepository {
  abstract findById(id: string, tx?: PrismaTx): Promise<Permission | null>;
  abstract findByCode(code: string, tx?: PrismaTx): Promise<Permission | null>;
  abstract findAll(
    query: PermissionQueryDto,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Permission>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<Permission>;
  abstract update(
    id: string,
    data: unknown,
    tx?: PrismaTx,
  ): Promise<Permission>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
