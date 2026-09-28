import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { RoleService } from './role.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RoleQueryDto } from './dto/role-query.dto.js';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Role created successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Role code already exists in organization' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  async create(@Body() createRoleDto: any): Promise<any> {
    // In a real implementation, organizationId would come from the authenticated user's context
    // For now, we'll throw an error to indicate this needs to be implemented
    throw new Error('OrganizationId must be provided from context');
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List roles with pagination and filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Roles retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(@Query() query: any): Promise<any> {
    return this.roleService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role found' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  async findById(@Param('id') id: string): Promise<any> {
    const role = await this.roleService.findById(id);
    if (!role) {
      throw new Error('Role not found');
    }
    return role;
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update role' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Role code already exists in organization' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  async update(@Param('id') id: string, @Body() updateRoleDto: any): Promise<any> {
    return this.roleService.update(id, updateRoleDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate role' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role deactivated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  async deactivate(@Param('id') id: string): Promise<any> {
    return this.roleService.deactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete role' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Role deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.roleService.delete(id);
  }
}