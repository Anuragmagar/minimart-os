import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { UnitRepository } from './unit.repository.js';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { UpdateUnitDto } from './dto/update-unit.dto.js';
import { UnitQueryDto } from './dto/unit-query.dto.js';

const AUDIT_ENTITY = 'Unit';

@Injectable()
export class UnitService {
  constructor(
    private readonly unitRepository: UnitRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireUnitInOrganization(ctx, id, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: UnitQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.unitRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    createUnitDto: CreateUnitDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    // Units are unique by code within an organization, not by name, so the
    // duplicate check is on the code.
    await this.requireCodeAvailable(ctx, createUnitDto.code, undefined, tx);

    return this.write(tx, async (write) => {
      const unit = await this.unitRepository.create(
        {
          organizationId: ctx.organizationId,
          name: createUnitDto.name,
          code: createUnitDto.code,
          precision: createUnitDto.precision,
          status: 'active',
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'unit.create',
          entity: AUDIT_ENTITY,
          entityId: unit.id,
          after: unit,
        },
        write,
      );

      return unit;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    updateUnitDto: UpdateUnitDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const unit = (await this.requireUnitInOrganization(ctx, id, tx)) as {
      id: string;
      code: string;
    };

    if (updateUnitDto.code !== undefined && updateUnitDto.code !== unit.code) {
      await this.requireCodeAvailable(ctx, updateUnitDto.code, id, tx);
    }

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {};
      if (updateUnitDto.name !== undefined) data.name = updateUnitDto.name;
      if (updateUnitDto.code !== undefined) data.code = updateUnitDto.code;
      if (updateUnitDto.precision !== undefined)
        data.precision = updateUnitDto.precision;
      if (updateUnitDto.status !== undefined)
        data.status = updateUnitDto.status;

      const updated = await this.unitRepository.update(id, data, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'unit.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: unit,
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
    const unit = await this.requireUnitInOrganization(ctx, id, tx);

    return this.write(tx, async (write) => {
      const updated = await this.unitRepository.update(
        id,
        { status: 'inactive' },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'unit.deactivate',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: unit,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * `products.unit_id`, `unit_conversions.from_unit_id`, and
   * `unit_conversions.to_unit_id` are all RESTRICT, so a unit that products or
   * conversions still reference cannot be removed without orphaning history.
   * The reference counts turn that database error into a clear instruction to
   * deactivate the unit instead.
   */
  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    const unit = await this.requireUnitInOrganization(ctx, id, tx);

    const client = tx ?? this.prisma.client;
    const [products, conversionsFrom, conversionsTo] = await Promise.all([
      client.product.count({ where: { unitId: id } }),
      client.unitConversion.count({ where: { fromUnitId: id } }),
      client.unitConversion.count({ where: { toUnitId: id } }),
    ]);

    if (products > 0) {
      throw new BadRequestException(
        'Unit is still referenced by products; deactivate it instead',
      );
    }
    if (conversionsFrom > 0 || conversionsTo > 0) {
      throw new BadRequestException(
        'Unit is still referenced by unit conversions; deactivate it instead',
      );
    }

    await this.write(tx, async (write) => {
      await this.unitRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'unit.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: unit,
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
   * The code is the organization-scoped identifier for a unit. `excludeId` lets
   * an update keep its own code without colliding with itself.
   */
  private async requireCodeAvailable(
    ctx: TenantContext,
    code: string,
    excludeId: string | undefined,
    tx?: PrismaTx,
  ): Promise<void> {
    const existing = await this.unitRepository.findByCode(
      code,
      ctx.organizationId,
      tx,
    );
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Unit with this code already exists in organization',
      );
    }
  }

  private async requireUnitInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const unit = await this.unitRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }
}
