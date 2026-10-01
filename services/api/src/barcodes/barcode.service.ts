import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { BarcodeRepository } from './barcode.repository.js';
import { ProductRepository } from '../products/product.repository.js';
import { CreateBarcodeDto } from './dto/create-barcode.dto.js';
import { UpdateBarcodeDto } from './dto/update-barcode.dto.js';

const AUDIT_ENTITY = 'ProductBarcode';

@Injectable()
export class BarcodeService {
  constructor(
    private readonly barcodeRepository: BarcodeRepository,
    private readonly productRepository: ProductRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    productId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireProduct(ctx, productId, tx);
    return this.requireBarcode(ctx, productId, id, tx);
  }

  async findAll(
    ctx: TenantContext,
    productId: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireProduct(ctx, productId, tx);
    return this.barcodeRepository.findAllForProduct(
      productId,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    productId: string,
    createBarcodeDto: CreateBarcodeDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const { barcode, barcodeType, isPrimary } = createBarcodeDto;
    await this.requireProduct(ctx, productId, tx);

    // Uniqueness is per organization, not per product: the same printed code
    // must not identify two products of one tenant. The same code in two
    // organizations is fine, which is why the lookup is scoped by the caller's
    // organization rather than by the parent product.
    const existing = await this.barcodeRepository.findByValue(
      barcode,
      ctx.organizationId,
      tx,
    );
    if (existing) {
      throw new ConflictException(
        'A barcode with this value already exists in organization',
      );
    }

    return this.write(tx, async (write) => {
      // The demotion and the insert share one transaction, so a product can
      // never be observed with two primary barcodes, nor with none after a
      // failed promotion.
      if (isPrimary) {
        await this.barcodeRepository.demotePrimary(
          productId,
          ctx.organizationId,
          write,
        );
      }

      const created = await this.barcodeRepository.create(
        {
          organizationId: ctx.organizationId,
          productId,
          barcode,
          barcodeType: barcodeType ?? null,
          isPrimary: isPrimary ?? false,
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product_barcode.create',
          entity: AUDIT_ENTITY,
          entityId: created.id,
          after: created,
        },
        write,
      );

      return created;
    });
  }

  async update(
    ctx: TenantContext,
    productId: string,
    id: string,
    updateBarcodeDto: UpdateBarcodeDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireProduct(ctx, productId, tx);
    const existing = await this.requireBarcode(ctx, productId, id, tx);

    const { barcodeType, isPrimary } = updateBarcodeDto;
    if (barcodeType === undefined && isPrimary === undefined) {
      return existing;
    }

    return this.write(tx, async (write) => {
      if (isPrimary === true) {
        // The row being updated is demoted along with any other primary and then
        // promoted again by the update below, so re-asserting primary status on
        // the barcode that already holds it is a no-op rather than a loss.
        await this.barcodeRepository.demotePrimary(
          productId,
          ctx.organizationId,
          write,
        );
      }

      const updated = await this.barcodeRepository.update(
        id,
        {
          // Tested against `undefined` rather than for truthiness, so an
          // explicit `null` clears the symbology label while an omitted field
          // is left untouched.
          ...(barcodeType !== undefined ? { barcodeType } : {}),
          ...(isPrimary !== undefined ? { isPrimary } : {}),
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product_barcode.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: existing,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * `product_barcodes` is lookup master data: no sales, inventory, purchasing or
   * pricing table references it, and deleting a product already cascades its
   * barcodes, so nothing historical can be orphaned by removing a row here. The
   * removal is still audited, because a barcode that has been scanned is part of
   * the record of what the shelf label said.
   */
  async delete(
    ctx: TenantContext,
    productId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<void> {
    await this.requireProduct(ctx, productId, tx);
    const existing = await this.requireBarcode(ctx, productId, id, tx);

    await this.write(tx, async (write) => {
      await this.barcodeRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product_barcode.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: existing,
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
   * The parent product is resolved through the caller's own organization before
   * any barcode is read, so a productId from another tenant is reported as a
   * missing product rather than as a missing barcode, and a caller cannot use
   * the barcode routes to probe which products another tenant owns.
   *
   * Path parameters are not shape-checked, which is the same as the product,
   * category, brand, unit and conversion routes: a productId that is a
   * well-formed UUID of another organization, or of no organization, is
   * reported as a missing product.
   */
  private async requireProduct(
    ctx: TenantContext,
    productId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const product = await this.productRepository.findByIdInOrganization(
      productId,
      ctx.organizationId,
      tx,
    );
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  private async requireBarcode(
    ctx: TenantContext,
    productId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const barcode = await this.barcodeRepository.findByIdInProduct(
      id,
      productId,
      ctx.organizationId,
      tx,
    );
    if (!barcode) {
      throw new NotFoundException('Barcode not found');
    }
    return barcode;
  }
}
