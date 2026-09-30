import type { PrismaTx } from '../database/prisma.service.js';
import type { UnitConversion } from '../generated/prisma/client.js';
import type { UnitConversionQueryDto } from './dto/unit-conversion-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/**
 * Every read method takes the caller's organizationId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument (AGENTS.md 13, BR-040).
 */
export abstract class UnitConversionRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<UnitConversion | null>;
  /**
   * Direction is unique per organization
   * (`@@unique([organizationId, fromUnitId, toUnitId])`). A reverse edge
   * (PCS -> DOZ) is a separate row and is never inferred from this one, because
   * a reciprocal factor such as 1/10 is not exactly representable at
   * DECIMAL(14,6) and no document defines how to round it.
   */
  abstract findByDirection(
    fromUnitId: string,
    toUnitId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<UnitConversion | null>;
  abstract findAllInOrganization(
    query: UnitConversionQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<UnitConversion>>;
  /**
   * Outgoing edges for a set of units, used by the service to walk the
   * conversion graph when checking whether a new edge would close a cycle.
   * Batched by source unit so the walk costs one query per level, not one per
   * node, and it returns the source with each target because the cycle rule
   * distinguishes the permitted direct reciprocal from a longer loop.
   */
  abstract findOutgoingEdges(
    fromUnitIds: string[],
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Array<{ fromUnitId: string; toUnitId: string }>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<UnitConversion>;
  abstract update(
    id: string,
    data: unknown,
    tx?: PrismaTx,
  ): Promise<UnitConversion>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
