import type { PrismaTx } from '../database/prisma.service.js';
import type { Unit } from '../generated/prisma/client.js';
import type { UnitQueryDto } from './dto/unit-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/**
 * Every read method takes the caller's organizationId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument (AGENTS.md 13, BR-040).
 */
export abstract class UnitRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Unit | null>;
  /**
   * Units are unique by `code` within an organization, not by name
   * (`@@unique([organizationId, code])`), so the duplicate check is on code.
   */
  abstract findByCode(
    code: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Unit | null>;
  abstract findAllInOrganization(
    query: UnitQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Unit>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<Unit>;
  abstract update(id: string, data: unknown, tx?: PrismaTx): Promise<Unit>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
