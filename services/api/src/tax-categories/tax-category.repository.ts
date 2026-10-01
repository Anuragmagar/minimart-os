import type { PrismaTx } from '../database/prisma.service.js';
import type { TaxCategory } from '../generated/prisma/client.js';
import type { TaxCategoryQueryDto } from './dto/tax-category-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/**
 * Every read method takes the caller's organizationId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument (AGENTS.md 13, BR-001, BR-040).
 */
export abstract class TaxCategoryRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<TaxCategory | null>;
  /**
   * Tax categories are unique by `code` within an organization
   * (`@@unique([organizationId, code])`). The name is not unique: two
   * categories may legitimately share a display name while carrying different
   * codes and rates, and nothing in the schema or the brain says otherwise.
   */
  abstract findByCode(
    code: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<TaxCategory | null>;
  abstract findAllInOrganization(
    query: TaxCategoryQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<TaxCategory>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<TaxCategory>;
  abstract update(
    id: string,
    data: unknown,
    tx?: PrismaTx,
  ): Promise<TaxCategory>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
