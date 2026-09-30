import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { BrandRepository } from './brand.repository.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { BrandQueryDto } from './dto/brand-query.dto.js';

const AUDIT_ENTITY = 'Brand';

@Injectable()
export class BrandService {
  constructor(
    private readonly brandRepository: BrandRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireBrandInOrganization(ctx, id, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: BrandQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.brandRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    createBrandDto: CreateBrandDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    // The organization always comes from the authenticated principal, so a brand
    // can never be created inside another tenant by supplying an id.
    const existing = await this.brandRepository.findByName(
      createBrandDto.name,
      ctx.organizationId,
      tx,
    );
    if (existing) {
      throw new ConflictException(
        'Brand with this name already exists in organization',
      );
    }

    return this.write(tx, async (write) => {
      const brand = await this.brandRepository.create(
        {
          organizationId: ctx.organizationId,
          name: createBrandDto.name,
          status: 'active',
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'brand.create',
          entity: AUDIT_ENTITY,
          entityId: brand.id,
          after: brand,
        },
        write,
      );

      return brand;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    updateBrandDto: UpdateBrandDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const brand = (await this.requireBrandInOrganization(ctx, id, tx)) as {
      id: string;
      name: string;
    };

    if (
      updateBrandDto.name !== undefined &&
      updateBrandDto.name !== brand.name
    ) {
      const existing = await this.brandRepository.findByName(
        updateBrandDto.name,
        ctx.organizationId,
        tx,
      );
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Brand with this name already exists in organization',
        );
      }
    }

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {};
      if (updateBrandDto.name !== undefined) data.name = updateBrandDto.name;
      if (updateBrandDto.status !== undefined)
        data.status = updateBrandDto.status;

      const updated = await this.brandRepository.update(id, data, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'brand.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: brand,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  async deactivate(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const brand = await this.requireBrandInOrganization(ctx, id, tx);

    return this.write(tx, async (write) => {
      const updated = await this.brandRepository.update(
        id,
        { status: 'inactive' },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'brand.deactivate',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: brand,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * `products.brand_id` is a RESTRICT foreign key, so a brand that products
   * still reference cannot be removed without orphaning product history. The
   * reference count is what turns that database error into a clear instruction
   * to deactivate the brand instead.
   */
  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    const brand = await this.requireBrandInOrganization(ctx, id, tx);

    const client = tx ?? this.prisma.client;
    const products = await client.product.count({ where: { brandId: id } });
    if (products > 0) {
      throw new BadRequestException(
        'Brand is still referenced by products; deactivate it instead',
      );
    }

    await this.write(tx, async (write) => {
      await this.brandRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'brand.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: brand,
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

  private async requireBrandInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const brand = await this.brandRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return brand;
  }
}
