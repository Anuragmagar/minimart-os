import type { PrismaTx } from '../database/prisma.service.js';
import type { Brand } from '../generated/prisma/client.js';
import type { BrandQueryDto } from './dto/brand-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/**
 * Every read method takes the caller's organizationId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument (AGENTS.md 13, BR-040).
 */
export abstract class BrandRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Brand | null>;
  abstract findByName(
    name: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Brand | null>;
  abstract findAllInOrganization(
    query: BrandQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Brand>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<Brand>;
  abstract update(id: string, data: unknown, tx?: PrismaTx): Promise<Brand>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
