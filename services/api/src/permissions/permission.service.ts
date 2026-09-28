import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
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

  async findById(id: string): Promise<any> {
    return this.permissionRepository.findById(id);
  }

  async findByCode(code: string): Promise<any> {
    return this.permissionRepository.findByCode(code);
  }

  async findAll(query: PermissionQueryDto): Promise<any> {
    return this.permissionRepository.findAll(query);
  }

  async create(createPermissionDto: CreatePermissionDto): Promise<any> {
    const existingPermission = await this.permissionRepository.findByCode(createPermissionDto.code);
    if (existingPermission) {
      throw new ConflictException('Permission with this code already exists');
    }

    return this.permissionRepository.create(createPermissionDto);
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto): Promise<any> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (updatePermissionDto.code && updatePermissionDto.code !== permission.code) {
      const existingPermission = await this.permissionRepository.findByCode(updatePermissionDto.code);
      if (existingPermission && existingPermission.id !== id) {
        throw new ConflictException('Permission with this code already exists');
      }
    }

    return this.permissionRepository.update(id, updatePermissionDto);
  }

  async deactivate(id: string): Promise<any> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return this.permissionRepository.update(id, { status: 'inactive' });
  }

  async delete(id: string): Promise<void> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    await this.permissionRepository.delete(id);
  }
}