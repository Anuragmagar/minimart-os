import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { TaxCategoryRepository } from './tax-category.repository.js';
import { CreateTaxCategoryDto } from './dto/create-tax-category.dto.js';
import { UpdateTaxCategoryDto } from './dto/update-tax-category.dto.js';
import { TaxCategoryQueryDto } from './dto/tax-category-query.dto.js';

const AUDIT_ENTITY = 'TaxCategory';

/**
 * A stored row, narrowed to what the service needs to reason about. The
 * effective dates come back from Prisma as `Date` objects, while a payload
 * carries ISO strings, so the window is compared as timestamps rather than as
 * text: comparing ISO strings lexicographically would be correct only while
 * both sides used the same offset, and `new Date()` normalizes that away.
 */
type StoredWindow = {
  id: string;
  code: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

@Injectable()
export class TaxCategoryService {
  constructor(
    private readonly taxCategoryRepository: TaxCategoryRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireTaxCategoryInOrganization(ctx, id, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: TaxCategoryQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.taxCategoryRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    createTaxCategoryDto: CreateTaxCategoryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    // The code is the organization-scoped identifier, and the existing
    // `@@unique([organizationId, code])` makes a duplicate a constraint error
    // rather than a 409, so it is checked first. The name is not unique.
    await this.requireCodeAvailable(
      ctx,
      createTaxCategoryDto.code,
      undefined,
      tx,
    );

    this.requireOrderedWindow(
      new Date(createTaxCategoryDto.effectiveFrom),
      toDateOrNull(createTaxCategoryDto.effectiveTo),
    );

    return this.write(tx, async (write) => {
      const taxCategory = await this.taxCategoryRepository.create(
        {
          organizationId: ctx.organizationId,
          name: createTaxCategoryDto.name,
          code: createTaxCategoryDto.code,
          rate: createTaxCategoryDto.rate,
          taxType: createTaxCategoryDto.taxType,
          effectiveFrom: new Date(createTaxCategoryDto.effectiveFrom),
          effectiveTo: toDateOrNull(createTaxCategoryDto.effectiveTo),
          // A new tax category is always active. Status is not a create-time
          // choice, matching the category, brand, and unit modules.
          status: 'active',
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'tax_category.create',
          entity: AUDIT_ENTITY,
          entityId: taxCategory.id,
          after: taxCategory,
        },
        write,
      );

      return taxCategory;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    updateTaxCategoryDto: UpdateTaxCategoryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const taxCategory = (await this.requireTaxCategoryInOrganization(
      ctx,
      id,
      tx,
    )) as StoredWindow;

    if (
      updateTaxCategoryDto.code !== undefined &&
      updateTaxCategoryDto.code !== taxCategory.code
    ) {
      await this.requireCodeAvailable(ctx, updateTaxCategoryDto.code, id, tx);
    }

    // BR-036 makes tax behavior effective-dated, so the window is validated on
    // every write, not only when the window itself is in the payload. The merged
    // window is what will actually be stored: a patch that moves only
    // `effectiveFrom` still has to leave the stored `effectiveTo` after it, and a
    // patch that sends `effectiveTo: null` is clearing the end of the window
    // rather than leaving it alone.
    const effectiveFrom =
      updateTaxCategoryDto.effectiveFrom === undefined
        ? taxCategory.effectiveFrom
        : new Date(updateTaxCategoryDto.effectiveFrom);
    const effectiveTo =
      updateTaxCategoryDto.effectiveTo === undefined
        ? taxCategory.effectiveTo
        : toDateOrNull(updateTaxCategoryDto.effectiveTo);
    this.requireOrderedWindow(effectiveFrom, effectiveTo);

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {};
      if (updateTaxCategoryDto.name !== undefined)
        data.name = updateTaxCategoryDto.name;
      if (updateTaxCategoryDto.code !== undefined)
        data.code = updateTaxCategoryDto.code;
      if (updateTaxCategoryDto.rate !== undefined)
        data.rate = updateTaxCategoryDto.rate;
      if (updateTaxCategoryDto.taxType !== undefined)
        data.taxType = updateTaxCategoryDto.taxType;
      if (updateTaxCategoryDto.effectiveFrom !== undefined)
        data.effectiveFrom = new Date(updateTaxCategoryDto.effectiveFrom);
      // `!== undefined` rather than a truthiness test, so an explicit null is
      // written through and clears the end of the window.
      if (updateTaxCategoryDto.effectiveTo !== undefined)
        data.effectiveTo = effectiveTo;
      if (updateTaxCategoryDto.status !== undefined)
        data.status = updateTaxCategoryDto.status;

      const updated = await this.taxCategoryRepository.update(id, data, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'tax_category.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: taxCategory,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * Deactivating retires a tax category from new use without touching the
   * products that already reference it. Nothing re-points those products and
   * nothing deletes the row, so the rate a historical sale was computed with
   * stays readable (BR-008).
   */
  async deactivate(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const taxCategory = await this.requireTaxCategoryInOrganization(
      ctx,
      id,
      tx,
    );

    return this.write(tx, async (write) => {
      const updated = await this.taxCategoryRepository.update(
        id,
        { status: 'inactive' },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'tax_category.deactivate',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: taxCategory,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * `products.tax_category_id` is RESTRICT, so a category that products still
   * reference cannot be removed without orphaning the reference that records how
   * those products were taxed. The reference count turns that database error
   * into a clear instruction to deactivate the category instead.
   */
  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    const taxCategory = await this.requireTaxCategoryInOrganization(
      ctx,
      id,
      tx,
    );

    const client = tx ?? this.prisma.client;
    const products = await client.product.count({
      where: { taxCategoryId: id },
    });

    if (products > 0) {
      throw new BadRequestException(
        'Tax category is still referenced by products; deactivate it instead',
      );
    }

    await this.write(tx, async (write) => {
      await this.taxCategoryRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'tax_category.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: taxCategory,
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
   * A null end means the rate is open-ended, which is the common case for a
   * rate that is in force until it is superseded. A supplied end must be
   * strictly later than the start; equal dates would describe a window of zero
   * length that no sale could fall inside, and an earlier end would describe a
   * window that never opens.
   */
  private requireOrderedWindow(
    effectiveFrom: Date,
    effectiveTo: Date | null,
  ): void {
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('effectiveFrom is not a valid date');
    }
    if (effectiveTo !== null) {
      if (Number.isNaN(effectiveTo.getTime())) {
        throw new BadRequestException('effectiveTo is not a valid date');
      }
      if (effectiveTo.getTime() <= effectiveFrom.getTime()) {
        throw new BadRequestException(
          'effectiveTo must be later than effectiveFrom',
        );
      }
    }
  }

  /**
   * The code is unique per organization, and `excludeId` lets an update keep its
   * own code without colliding with itself.
   */
  private async requireCodeAvailable(
    ctx: TenantContext,
    code: string,
    excludeId: string | undefined,
    tx?: PrismaTx,
  ): Promise<void> {
    const existing = await this.taxCategoryRepository.findByCode(
      code,
      ctx.organizationId,
      tx,
    );
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Tax category with this code already exists in organization',
      );
    }
  }

  private async requireTaxCategoryInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const taxCategory = await this.taxCategoryRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!taxCategory) {
      throw new NotFoundException('Tax category not found');
    }
    return taxCategory;
  }
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value === undefined || value === null ? null : new Date(value);
}
