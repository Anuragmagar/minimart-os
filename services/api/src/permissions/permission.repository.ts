import type { PrismaTx } from '../database/prisma.service.js';
import type { Permission } from '../generated/prisma/client.js';
import type { PermissionQueryDto } from './dto/permission-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

export abstract class PermissionRepository {
  abstract findById(id: string, tx?: PrismaTx): Promise<Permission | null>;
  abstract findByCode(code: string, tx?: PrismaTx): Promise<any | null>;
  abstract findAll(query: PermissionQueryDto, tx?: PrismaTx): Promise<any>;
  abstract create(data: any, tx?: PrismaTx): Promise<any>;
  abstract update(id: string, data: any, tx?: PrismaTx): Promise<any>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}