import type { PrismaTx } from '../database/prisma.service.js';
import type { ProductBarcode } from '../generated/prisma/client.js';

/**
 * Every read method takes the caller's organizationId, and the ones reached
 * through a nested route also take the parent productId. The repository never
 * resolves organization scope itself, so a caller cannot widen a query past its
 * own tenant by omitting the argument, and cannot reach a sibling product's
 * barcode by passing a productId that is not its own (AGENTS.md 13, BR-003,
 * BR-040).
 */
export abstract class BarcodeRepository {
  /**
   * Both `id` and `productId` are part of the lookup because a barcode id alone
   * would let a caller address a barcode of another product inside the same
   * organization by putting that product's id in the path.
   */
  abstract findByIdInProduct(
    id: string,
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductBarcode | null>;
  /**
   * A barcode value is unique within an organization
   * (`@@unique([organizationId, barcode])`), not within a product, because the
   * same printed code must not identify two products of the same organization.
   * The same value in two different organizations is allowed: the column is
   * denormalized with `organizationId` precisely so that tenant scope is carried
   * on the row rather than inferred through the product.
   */
  abstract findByValue(
    barcode: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductBarcode | null>;
  /**
   * A product carries a handful of barcodes (its EAN/UPC plus any in-store
   * codes), so the collection is returned whole and ordered oldest first rather
   * than paginated: there is no filter to narrow it by and no page a caller
   * would need. A product cannot reach an arbitrary number of barcodes through
   * this API, so the result stays bounded.
   */
  abstract findAllForProduct(
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<ProductBarcode[]>;
  abstract create(data: unknown, tx?: PrismaTx): Promise<ProductBarcode>;
  abstract update(
    id: string,
    data: unknown,
    tx?: PrismaTx,
  ): Promise<ProductBarcode>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
  /**
   * Clears `is_primary` on every primary barcode of one product. The rule that a
   * product has at most one primary barcode cannot be expressed by a unique
   * constraint, because the constraint would have to be partial (`WHERE
   * is_primary`), so it is enforced here in the application: the demotion and
   * the promotion that follows it run inside the same transaction (ASM-014,
   * ASM-052).
   */
  abstract demotePrimary(
    productId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<void>;
}
