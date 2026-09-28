import type { PrismaTx } from '../database/prisma.service.js';
import type { Role } from '../generated/prisma/client.js';
import type { RoleQueryDto } from './dto/role-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

export abstract class RoleRepository {
  abstract findById(id: string, tx?: PrismaTx): Promise<Role | null>;
  abstract findByCode(code: string, organizationId: string, tx?: PrismaTx): Promise<any | null>;
  abstract findAll(query: RoleQueryDto, tx?: PrismaTx): Promise<any>;
  abstract create(data: any, tx?: PrismaTx): Promise<any>;
  abstract update(id: string, data: any, tx?: PrismaTx): Promise<any>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}