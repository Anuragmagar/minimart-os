import type { PrismaTx } from '../database/prisma.service.js';
import type { Category } from '../generated/prisma/client.js';
import type { CategoryQueryDto } from './dto/category-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/**
 * Every read method takes the caller's organizationId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument (AGENTS.md 13, BR-040).
 */
export abstract class CategoryRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Category | null>;
  abstract findByName(
    name: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Category | null>;
  abstract findAllInOrganization(
    query: CategoryQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Category>>;
  /** Returns a single ancestor hop, used to walk the tree and reject cycles. */
  abstract findParentIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<string | null>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<Category>;
  abstract update(id: string, data: unknown, tx?: PrismaTx): Promise<Category>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
