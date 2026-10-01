import type { PrismaTx } from '../database/prisma.service.js';
import type { Product } from '../generated/prisma/client.js';
import type { ProductQueryDto } from './dto/product-query.dto.js';
import type { PaginatedResponseDto } from '../users/dto/paginated-response.dto.js';

/**
 * Every read method takes the caller's organizationId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument (AGENTS.md 13, BR-003, BR-040).
 */
export abstract class ProductRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Product | null>;
  /**
   * A product is unique by `sku` within an organization
   * (`@@unique([organizationId, sku])`). The name is not unique: a mini-mart
   * legitimately stocks the same product name in several sizes, and no brain
   * document says otherwise.
   */
  abstract findBySku(
    sku: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<Product | null>;
  abstract findAllInOrganization(
    query: ProductQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<PaginatedResponseDto<Product>>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<Product>;
  abstract update(id: string, data: unknown, tx?: PrismaTx): Promise<Product>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
