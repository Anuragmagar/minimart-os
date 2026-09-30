import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/guards/permissions.guard.js';
import { RequireTenantScope } from '../common/guards/tenant-scope.guard.js';
import { PERMISSION } from '../auth/permission-codes.js';
import { TenantContextParam } from '../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { RoleService } from './role.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RoleQueryDto } from './dto/role-query.dto.js';
import { RoleResponseDto } from './dto/role-response.dto.js';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@RequirePermissions(PERMISSION.rolesManage)
@RequireTenantScope()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a role in the caller organization' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: RoleResponseDto,
    description: 'Role created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Role code already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing roles:manage',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Body() createRoleDto: CreateRoleDto,
  ): Promise<unknown> {
    return this.roleService.create(ctx, createRoleDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List roles in the caller organization' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Roles retrieved' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: RoleQueryDto,
  ): Promise<unknown> {
    return this.roleService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a role in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: RoleResponseDto,
    description: 'Role found',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.roleService.findById(ctx, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a role in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: RoleResponseDto,
    description: 'Role updated',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Role code already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<unknown> {
    return this.roleService.update(ctx, id, updateRoleDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a role, revoking its permissions' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: RoleResponseDto,
    description: 'Role deactivated',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  async deactivate(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.roleService.deactivate(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unassigned role' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Role deleted' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Role is still assigned to users',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.roleService.delete(ctx, id);
  }
}
