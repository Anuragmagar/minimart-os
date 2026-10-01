import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { ProductRepository } from './product.repository.js';
import { CategoryRepository } from '../categories/category.repository.js';
import { BrandRepository } from '../brands/brand.repository.js';
import { UnitRepository } from '../units/unit.repository.js';
import { TaxCategoryRepository } from '../tax-categories/tax-category.repository.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';

const AUDIT_ENTITY = 'Product';

/**
 * One reference a product may carry, together with the lookup that proves it
 * belongs to the caller's organization. The four parent foreign keys on
 * `products` only check that the referenced row exists, never whose it is, so
 * the service is the only thing standing between a caller and a product wired
 * into another tenant's catalog (BR-040).
 */
type ProductReference = {
  field: 'categoryId' | 'brandId' | 'unitId' | 'taxCategoryId';
  id: string | null | undefined;
  lookup: (
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ) => Promise<unknown>;
};

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly brandRepository: BrandRepository,
    private readonly unitRepository: UnitRepository,
    private readonly taxCategoryRepository: TaxCategoryRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireProductInOrganization(ctx, id, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: ProductQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.productRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  /**
   * A product is unique by SKU within an organization, not by name: a mini-mart
   * stocks the same product name in several sizes, and the schema encodes that
   * with `@@unique([organizationId, sku])` and no name constraint. `status` is
   * set here rather than accepted from the body, matching the category, brand
   * and unit modules, so a product can never be born inactive by accident.
   *
   * The reference and duplicate checks run before the transaction opens, the
   * same check-then-act shape the other catalog modules use. The database unique
   * constraint is the real guard on the SKU race; a reference that is deleted
   * between the check and the write is caught by the foreign key.
   */
  async create(
    ctx: TenantContext,
    createProductDto: CreateProductDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireSkuAvailable(ctx, createProductDto.sku, undefined, tx);
    await this.requireReferencesInOrganization(
      ctx,
      this.referencesFrom(createProductDto),
      tx,
    );

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {
        organizationId: ctx.organizationId,
        name: createProductDto.name,
        sku: createProductDto.sku,
        status: 'active',
      };
      if (createProductDto.description !== undefined) {
        data.description = createProductDto.description;
      }
      if (createProductDto.categoryId !== undefined) {
        data.categoryId = createProductDto.categoryId;
      }
      if (createProductDto.brandId !== undefined) {
        data.brandId = createProductDto.brandId;
      }
      if (createProductDto.unitId !== undefined) {
        data.unitId = createProductDto.unitId;
      }
      if (createProductDto.taxCategoryId !== undefined) {
        data.taxCategoryId = createProductDto.taxCategoryId;
      }
      if (createProductDto.defaultPurchasePrice !== undefined) {
        data.defaultPurchasePrice = createProductDto.defaultPurchasePrice;
      }
      if (createProductDto.defaultSellingPrice !== undefined) {
        data.defaultSellingPrice = createProductDto.defaultSellingPrice;
      }
      if (createProductDto.reorderLevel !== undefined) {
        data.reorderLevel = createProductDto.reorderLevel;
      }
      if (createProductDto.reorderQuantity !== undefined) {
        data.reorderQuantity = createProductDto.reorderQuantity;
      }

      const product = await this.productRepository.create(data, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product.create',
          entity: AUDIT_ENTITY,
          entityId: product.id,
          after: product,
        },
        write,
      );

      return product;
    });
  }

  /**
   * Only the fields present in the payload are written, so an omitted field
   * keeps its stored value. Each nullable column is tested for `undefined`
   * rather than for truthiness, which is what makes an explicit `null` clear a
   * category, a brand, a unit, a tax category, a description or a price instead
   * of being silently ignored.
   */
  async update(
    ctx: TenantContext,
    id: string,
    updateProductDto: UpdateProductDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const product = await this.requireProductInOrganization(ctx, id, tx);

    if (
      updateProductDto.sku !== undefined &&
      updateProductDto.sku !== (product as { sku: string }).sku
    ) {
      await this.requireSkuAvailable(ctx, updateProductDto.sku, id, tx);
    }

    // Only the references actually being changed are re-checked, so a partial
    // update does not pay for four extra round trips.
    await this.requireReferencesInOrganization(
      ctx,
      this.referencesFrom(updateProductDto).filter(
        (reference) => reference.field in updateProductDto,
      ),
      tx,
    );

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {};
      if (updateProductDto.name !== undefined)
        data.name = updateProductDto.name;
      if (updateProductDto.sku !== undefined) data.sku = updateProductDto.sku;
      if (updateProductDto.description !== undefined) {
        data.description = updateProductDto.description;
      }
      if (updateProductDto.categoryId !== undefined) {
        data.categoryId = updateProductDto.categoryId;
      }
      if (updateProductDto.brandId !== undefined) {
        data.brandId = updateProductDto.brandId;
      }
      if (updateProductDto.unitId !== undefined) {
        data.unitId = updateProductDto.unitId;
      }
      if (updateProductDto.taxCategoryId !== undefined) {
        data.taxCategoryId = updateProductDto.taxCategoryId;
      }
      if (updateProductDto.defaultPurchasePrice !== undefined) {
        data.defaultPurchasePrice = updateProductDto.defaultPurchasePrice;
      }
      if (updateProductDto.defaultSellingPrice !== undefined) {
        data.defaultSellingPrice = updateProductDto.defaultSellingPrice;
      }
      if (updateProductDto.reorderLevel !== undefined) {
        data.reorderLevel = updateProductDto.reorderLevel;
      }
      if (updateProductDto.reorderQuantity !== undefined) {
        data.reorderQuantity = updateProductDto.reorderQuantity;
      }
      if (updateProductDto.status !== undefined) {
        data.status = updateProductDto.status;
      }

      const updated = await this.productRepository.update(id, data, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: product,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * Deactivation is a status flip rather than a delete, because
   * docs/DATABASE_CONVENTIONS.md prefers soft deactivation for master data and
   * a product is the one catalog row that financial history points at. Nothing
   * else is changed: existing stock, open purchase orders and already-issued
   * sales are untouched, and no brain document defines any further effect, so
   * none is invented here.
   */
  async deactivate(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const product = await this.requireProductInOrganization(ctx, id, tx);

    return this.write(tx, async (write) => {
      const updated = await this.productRepository.update(
        id,
        { status: 'inactive' },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product.deactivate',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: product,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * Ten child tables reference a product with `onDelete: Restrict`, so a
   * product that anything has ever recorded cannot be removed without
   * destroying that history, which AGENTS.md section 15 forbids. The counts turn
   * the database error into an instruction to deactivate the product instead,
   * matching the guard the category, brand and unit modules already carry.
   *
   * `product_barcodes` is the one inbound relation that cascades, so it is not
   * counted: it carries no financial or inventory meaning of its own, and
   * barcode management is Task 05.06.
   *
   * The groups are checked most-permanent first so the message names the
   * history that is hardest to undo: a sale, then inventory, then purchasing,
   * then price history.
   */
  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    const product = await this.requireProductInOrganization(ctx, id, tx);

    const client = tx ?? this.prisma.client;
    const [
      saleItems,
      saleReturnItems,
      batches,
      balances,
      movements,
      adjustmentItems,
      transferItems,
      purchaseOrderItems,
      receiptItems,
      prices,
    ] = await Promise.all([
      client.saleItem.count({ where: { productId: id } }),
      client.saleReturnItem.count({ where: { productId: id } }),
      client.productBatch.count({ where: { productId: id } }),
      client.inventoryBalance.count({ where: { productId: id } }),
      client.inventoryMovement.count({ where: { productId: id } }),
      client.stockAdjustmentItem.count({ where: { productId: id } }),
      client.stockTransferItem.count({ where: { productId: id } }),
      client.purchaseOrderItem.count({ where: { productId: id } }),
      client.goodsReceiptItem.count({ where: { productId: id } }),
      client.productPrice.count({ where: { productId: id } }),
    ]);

    if (saleItems > 0 || saleReturnItems > 0) {
      throw new BadRequestException(
        'Product has sales history; deactivate it instead',
      );
    }
    if (
      batches > 0 ||
      balances > 0 ||
      movements > 0 ||
      adjustmentItems > 0 ||
      transferItems > 0
    ) {
      throw new BadRequestException(
        'Product has inventory history; deactivate it instead',
      );
    }
    if (purchaseOrderItems > 0 || receiptItems > 0) {
      throw new BadRequestException(
        'Product is referenced by purchasing records; deactivate it instead',
      );
    }
    if (prices > 0) {
      throw new BadRequestException(
        'Product has price history; deactivate it instead',
      );
    }

    await this.write(tx, async (write) => {
      await this.productRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: product,
        },
        write,
      );
    });
  }

  private write<T>(
    tx: PrismaTx | undefined,
    fn: (write: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.runInTransaction(fn);
  }

  /**
   * A reference must exist inside the caller's own organization. The database
   * foreign key does not check organization, so a cross-tenant category, brand,
   * unit or tax category would otherwise be accepted (BR-040). A reference that
   * does not resolve is reported as an invalid reference rather than as a
   * forbidden one, for the same reason a product in another tenant reads as not
   * found: existence is not disclosed across tenants.
   */
  private async requireReferencesInOrganization(
    ctx: TenantContext,
    references: ProductReference[],
    tx?: PrismaTx,
  ): Promise<void> {
    const present = references.filter(
      (reference) => reference.id !== null && reference.id !== undefined,
    );
    if (present.length === 0) {
      return;
    }

    const found = await Promise.all(
      present.map((reference) =>
        reference.lookup(reference.id as string, ctx.organizationId, tx),
      ),
    );

    for (const [index, reference] of present.entries()) {
      if (!found[index]) {
        throw new BadRequestException(
          `Invalid ${reference.field} for this organization`,
        );
      }
    }
  }

  /**
   * Builds the reference checks for whichever of the four optional parent ids
   * the payload carries. All four go through a repository, so none of these
   * tenant checks can drift apart from the others. A product's `taxCategoryId`
   * is a reference only: no tax rate is read onto the product row, and the
   * category's own status and effective window are deliberately not checked here
   * because deciding which rate applies to a transaction belongs to Task 14.03
   * (ASM-053).
   */
  private referencesFrom(dto: {
    categoryId?: string | null;
    brandId?: string | null;
    unitId?: string | null;
    taxCategoryId?: string | null;
  }): ProductReference[] {
    return [
      {
        field: 'categoryId',
        id: dto.categoryId,
        lookup: (id, organizationId, tx) =>
          this.categoryRepository.findByIdInOrganization(
            id,
            organizationId,
            tx,
          ),
      },
      {
        field: 'brandId',
        id: dto.brandId,
        lookup: (id, organizationId, tx) =>
          this.brandRepository.findByIdInOrganization(id, organizationId, tx),
      },
      {
        field: 'unitId',
        id: dto.unitId,
        lookup: (id, organizationId, tx) =>
          this.unitRepository.findByIdInOrganization(id, organizationId, tx),
      },
      {
        field: 'taxCategoryId',
        id: dto.taxCategoryId,
        lookup: (id, organizationId, tx) =>
          this.taxCategoryRepository.findByIdInOrganization(
            id,
            organizationId,
            tx,
          ),
      },
    ];
  }

  /**
   * The SKU is the organization-scoped identifier for a product. `excludeId`
   * lets an update keep its own SKU without colliding with itself.
   */
  private async requireSkuAvailable(
    ctx: TenantContext,
    sku: string,
    excludeId: string | undefined,
    tx?: PrismaTx,
  ): Promise<void> {
    const existing = await this.productRepository.findBySku(
      sku,
      ctx.organizationId,
      tx,
    );
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Product with this SKU already exists in organization',
      );
    }
  }

  private async requireProductInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const product = await this.productRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
}
