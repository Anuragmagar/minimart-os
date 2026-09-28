import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
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

  async findById(id: string): Promise<any> {
    return this.roleRepository.findById(id);
  }

  async findByCode(code: string, organizationId: string): Promise<any> {
    return this.roleRepository.findByCode(code, organizationId);
  }

  async findAll(query: RoleQueryDto): Promise<any> {
    return this.roleRepository.findAll(query);
  }

  async create(createRoleDto: CreateRoleDto): Promise<any> {
    // Check if code already exists in organization
    // We need to get organizationId from context - for now, we'll throw if not provided
    // In a real implementation, this would come from the authenticated user's context
    throw new Error('OrganizationId must be provided from context');
  }

  async createWithOrg(createRoleDto: CreateRoleDto, organizationId: string): Promise<any> {
    const existingRole = await this.roleRepository.findByCode(createRoleDto.code, organizationId);
    if (existingRole) {
      throw new ConflictException('Role with this code already exists in organization');
    }

    return this.prisma.client.role.create({
      data: {
        ...createRoleDto,
        organizationId,
      },
    });
  }

  async update(id: string, updateRoleDto: any): Promise<any> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (updateRoleDto.code && updateRoleDto.code !== role.code) {
      const existingRole = await this.roleRepository.findByCode(updateRoleDto.code, role.organizationId);
      if (existingRole && existingRole.id !== id) {
        throw new ConflictException('Role with this code already exists in organization');
      }
    }

    return this.roleRepository.update(id, updateRoleDto);
  }

  async deactivate(id: string): Promise<any> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.roleRepository.update(id, { status: 'inactive' });
  }

  async delete(id: string): Promise<void> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    await this.roleRepository.delete(id);
  }
}