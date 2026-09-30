import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { isKnownPermissionCode } from '../auth/permission-codes.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { RoleRepository } from './role.repository.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RoleQueryDto } from './dto/role-query.dto.js';

@Injectable()
export class RoleService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireRoleInOrganization(ctx, id, tx);
  }

  async findByCode(
    ctx: TenantContext,
    code: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.roleRepository.findByCode(code, ctx.organizationId, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: RoleQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.roleRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    createRoleDto: CreateRoleDto & { permissionIds?: string[] },
    tx?: PrismaTx,
  ): Promise<unknown> {
    // The organization always comes from the authenticated principal. A role can
    // never be created inside another tenant by supplying an id.
    const existing = await this.roleRepository.findByCode(
      createRoleDto.code,
      ctx.organizationId,
      tx,
    );
    if (existing) {
      throw new ConflictException(
        'Role with this code already exists in organization',
      );
    }

    const permissionIds = await this.resolvePermissionIds(
      createRoleDto.permissionIds,
      tx,
    );

    return this.write(tx, async (write) => {
      const role = await this.roleRepository.create(
        {
          organizationId: ctx.organizationId,
          name: createRoleDto.name,
          code: createRoleDto.code,
          description: createRoleDto.description ?? null,
          status: 'active',
        },
        write,
      );

      for (const permissionId of permissionIds) {
        await write.rolePermission.create({
          data: { roleId: role.id, permissionId },
        });
      }

      return role;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    updateRoleDto: UpdateRoleDto & { permissionIds?: string[] },
    tx?: PrismaTx,
  ): Promise<unknown> {
    const role = (await this.requireRoleInOrganization(ctx, id, tx)) as {
      id: string;
      code: string;
    };

    if (updateRoleDto.code && updateRoleDto.code !== role.code) {
      const existing = await this.roleRepository.findByCode(
        updateRoleDto.code,
        ctx.organizationId,
        tx,
      );
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Role with this code already exists in organization',
        );
      }
    }

    const permissionIds =
      updateRoleDto.permissionIds === undefined
        ? null
        : await this.resolvePermissionIds(updateRoleDto.permissionIds, tx);

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {};
      if (updateRoleDto.name !== undefined) data.name = updateRoleDto.name;
      if (updateRoleDto.code !== undefined) data.code = updateRoleDto.code;
      if (updateRoleDto.description !== undefined)
        data.description = updateRoleDto.description;
      if (updateRoleDto.status !== undefined)
        data.status = updateRoleDto.status;

      const updated = await this.roleRepository.update(id, data, write);

      if (permissionIds) {
        await write.rolePermission.deleteMany({ where: { roleId: id } });
        for (const permissionId of permissionIds) {
          await write.rolePermission.create({
            data: { roleId: id, permissionId },
          });
        }
      }

      return updated;
    });
  }

  async deactivate(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireRoleInOrganization(ctx, id, tx);
    return this.roleRepository.update(id, { status: 'inactive' }, tx);
  }

  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    await this.requireRoleInOrganization(ctx, id, tx);

    const assigned = await (tx ?? this.prisma.client).userRole.count({
      where: { roleId: id },
    });
    if (assigned > 0) {
      throw new BadRequestException(
        'Role is still assigned to users; deactivate it instead',
      );
    }

    await this.roleRepository.delete(id, tx);
  }

  private write<T>(
    tx: PrismaTx | undefined,
    fn: (write: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.runInTransaction(fn);
  }

  private async requireRoleInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const role = await this.roleRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  /**
   * Permission ids are global records, so an id outside the catalog is rejected
   * outright rather than being attached and silently ignored.
   */
  private async resolvePermissionIds(
    ids: string[] | undefined,
    tx?: PrismaTx,
  ): Promise<string[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const unique = [...new Set(ids)];
    const permissions = await (tx ?? this.prisma.client).permission.findMany({
      where: { id: { in: unique } },
      select: { id: true, code: true, status: true },
    });

    const found = new Map(
      permissions.map((permission) => [permission.id, permission]),
    );

    for (const id of unique) {
      if (!found.has(id)) {
        throw new BadRequestException(`Unknown permissionId: ${id}`);
      }
      if (!isKnownPermissionCode(found.get(id)!.code)) {
        throw new BadRequestException(
          `Permission ${found.get(id)!.code} is not in the catalog`,
        );
      }
    }

    return unique;
  }
}
