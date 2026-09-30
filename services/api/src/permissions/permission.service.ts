import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { isKnownPermissionCode } from '../auth/permission-codes.js';
import { PermissionRepository } from './permission.repository.js';
import { CreatePermissionDto } from './dto/create-permission.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';
import { PermissionQueryDto } from './dto/permission-query.dto.js';

@Injectable()
export class PermissionService {
  constructor(
    private readonly permissionRepository: PermissionRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findById(id: string): Promise<unknown> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    return permission;
  }

  async findByCode(code: string): Promise<unknown> {
    return this.permissionRepository.findByCode(code);
  }

  async findAll(query: PermissionQueryDto): Promise<unknown> {
    return this.permissionRepository.findAll(query);
  }

  async create(createPermissionDto: CreatePermissionDto): Promise<unknown> {
    // The catalog is closed. A code that is not in brain/SECURITY.md cannot be
    // created here, because a guard could never legitimately require it and it
    // would become an unaudited authorization primitive.
    if (!isKnownPermissionCode(createPermissionDto.code)) {
      throw new BadRequestException(
        `Permission code "${createPermissionDto.code}" is not in the catalog`,
      );
    }

    const existingPermission = await this.permissionRepository.findByCode(
      createPermissionDto.code,
    );
    if (existingPermission) {
      throw new BadRequestException('Permission with this code already exists');
    }

    return this.permissionRepository.create(createPermissionDto);
  }

  async update(
    id: string,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<unknown> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (
      updatePermissionDto.code &&
      updatePermissionDto.code !== permission.code
    ) {
      if (!isKnownPermissionCode(updatePermissionDto.code)) {
        throw new BadRequestException(
          `Permission code "${updatePermissionDto.code}" is not in the catalog`,
        );
      }
      const existing = await this.permissionRepository.findByCode(
        updatePermissionDto.code,
      );
      if (existing && existing.id !== id) {
        throw new BadRequestException(
          'Permission with this code already exists',
        );
      }
    }

    return this.permissionRepository.update(id, updatePermissionDto);
  }

  async deactivate(id: string): Promise<unknown> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return this.permissionRepository.update(id, { status: 'inactive' });
  }

  /**
   * Deleting a permission cascades role_permissions and silently removes it from
   * every role that held it (SECURITY.md Audit: permissions are authorization
   * data). A permission that is in use is therefore never hard-deleted.
   */
  async delete(id: string): Promise<void> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const rolesUsing = await this.prisma.client.rolePermission.count({
      where: { permissionId: id },
    });
    if (rolesUsing > 0) {
      throw new ForbiddenException(
        'Permission is assigned to roles; deactivate it instead of deleting it',
      );
    }

    await this.permissionRepository.delete(id);
  }
}
