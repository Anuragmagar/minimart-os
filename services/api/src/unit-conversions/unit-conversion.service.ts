import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { UnitConversionRepository } from './unit-conversion.repository.js';
import { UnitRepository } from '../units/unit.repository.js';
import { CreateUnitConversionDto } from './dto/create-unit-conversion.dto.js';
import { UpdateUnitConversionDto } from './dto/update-unit-conversion.dto.js';
import { UnitConversionQueryDto } from './dto/unit-conversion-query.dto.js';

const AUDIT_ENTITY = 'UnitConversion';

/**
 * A factor of exactly zero is syntactically a valid DECIMAL(14,6) but means one
 * carton holds no pieces, so it is rejected. The check is on the string rather
 * than on a parsed number because the column is exact decimal and a float parse
 * would be the wrong tool.
 */
function isPositive(multiplier: string): boolean {
  return /[1-9]/.test(multiplier);
}

@Injectable()
export class UnitConversionService {
  constructor(
    private readonly conversionRepository: UnitConversionRepository,
    private readonly unitRepository: UnitRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireConversionInOrganization(ctx, id, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: UnitConversionQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.conversionRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    createUnitConversionDto: CreateUnitConversionDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const { fromUnitId, toUnitId, multiplier } = createUnitConversionDto;

    if (!isPositive(multiplier)) {
      throw new BadRequestException(
        'Conversion multiplier must be greater than zero',
      );
    }

    if (fromUnitId === toUnitId) {
      throw new BadRequestException('A unit cannot be converted into itself');
    }

    // Both endpoints are resolved in the caller's own organization, so a
    // conversion can never link units across a tenant boundary.
    const [fromUnit, toUnit] = await Promise.all([
      this.unitRepository.findByIdInOrganization(
        fromUnitId,
        ctx.organizationId,
        tx,
      ),
      this.unitRepository.findByIdInOrganization(
        toUnitId,
        ctx.organizationId,
        tx,
      ),
    ]);
    if (!fromUnit) {
      throw new NotFoundException('Source unit not found');
    }
    if (!toUnit) {
      throw new NotFoundException('Target unit not found');
    }

    const existing = await this.conversionRepository.findByDirection(
      fromUnitId,
      toUnitId,
      ctx.organizationId,
      tx,
    );
    if (existing) {
      throw new ConflictException(
        'A conversion for this direction already exists in organization',
      );
    }

    if (await this.wouldCloseCycle(ctx, fromUnitId, toUnitId, tx)) {
      throw new BadRequestException(
        'This conversion would create a cycle with the existing conversions',
      );
    }

    return this.write(tx, async (write) => {
      const conversion = await this.conversionRepository.create(
        {
          organizationId: ctx.organizationId,
          fromUnitId,
          toUnitId,
          multiplier,
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'unit_conversion.create',
          entity: AUDIT_ENTITY,
          entityId: conversion.id,
          after: conversion,
        },
        write,
      );

      return conversion;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    updateUnitConversionDto: UpdateUnitConversionDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const conversion = await this.requireConversionInOrganization(ctx, id, tx);

    if (updateUnitConversionDto.multiplier === undefined) {
      return conversion;
    }

    const { multiplier } = updateUnitConversionDto;
    if (!isPositive(multiplier)) {
      throw new BadRequestException(
        'Conversion multiplier must be greater than zero',
      );
    }

    return this.write(tx, async (write) => {
      const updated = await this.conversionRepository.update(
        id,
        { multiplier },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'unit_conversion.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: conversion,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * `unit_conversions` has no status column, so there is no soft-deactivation
   * path and the row is removed outright. Nothing in the schema references a
   * conversion, so no recorded quantity can be orphaned by this delete.
   */
  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    const conversion = await this.requireConversionInOrganization(ctx, id, tx);

    await this.write(tx, async (write) => {
      await this.conversionRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'unit_conversion.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: conversion,
        },
        write,
      );
    });
  }

  /**
   * Adding `fromUnitId -> toUnitId` closes a cycle when `fromUnitId` is already
   * reachable from `toUnitId` by a longer route. A single direct hop back, the
   * reciprocal pair `toUnitId -> fromUnitId`, is permitted by decision so both
   * directions of a purchase/selling pair can be recorded explicitly; only loops
   * of three or more units are refused.
   *
   * The walk is breadth-first one level at a time and tracks visited units, so a
   * graph that somehow already contains a loop still terminates, and it cannot
   * overflow the call stack the way a recursive walk could (the same reasoning as
   * the category ancestor walk in 05.01, ASM-047).
   */
  private async wouldCloseCycle(
    ctx: TenantContext,
    fromUnitId: string,
    toUnitId: string,
    tx?: PrismaTx,
  ): Promise<boolean> {
    const visited = new Set<string>([toUnitId]);
    let frontier: string[] = [toUnitId];
    let isFirstLevel = true;

    while (frontier.length > 0) {
      const edges = await this.conversionRepository.findOutgoingEdges(
        frontier,
        ctx.organizationId,
        tx,
      );
      const next: string[] = [];
      for (const edge of edges) {
        if (edge.toUnitId === fromUnitId) {
          // The single permitted direct hop, `toUnitId -> fromUnitId`, is only
          // ever examined on the first level because `toUnitId` is in `visited`
          // and is never re-expanded. Testing the level rather than the source
          // keeps a longer route back from being mistaken for that hop.
          if (isFirstLevel && edge.fromUnitId === toUnitId) {
            continue;
          }
          return true;
        }
        if (!visited.has(edge.toUnitId)) {
          visited.add(edge.toUnitId);
          next.push(edge.toUnitId);
        }
      }
      frontier = next;
      isFirstLevel = false;
    }

    return false;
  }

  private write<T>(
    tx: PrismaTx | undefined,
    fn: (write: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.runInTransaction(fn);
  }

  private async requireConversionInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const conversion = await this.conversionRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!conversion) {
      throw new NotFoundException('Unit conversion not found');
    }
    return conversion;
  }
}
