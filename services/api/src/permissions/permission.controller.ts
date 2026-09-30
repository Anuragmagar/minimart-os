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
import { PERMISSION } from '../auth/permission-codes.js';
import { PermissionService } from './permission.service.js';
import { CreatePermissionDto } from './dto/create-permission.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';
import { PermissionQueryDto } from './dto/permission-query.dto.js';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
// The permission catalog is global, but there is no "read permissions" code in
// the brain/SECURITY.md catalog, so every route is gated by roles:manage and
// fails closed. Tenant scope does not apply: Permission has no organizationId.
@RequirePermissions(PERMISSION.rolesManage)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a catalog permission code' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Permission created',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing roles:manage',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Code is not in the catalog',
  })
  async create(
    @Body() createPermissionDto: CreatePermissionDto,
  ): Promise<unknown> {
    return this.permissionService.create(createPermissionDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List permissions with pagination and filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permissions retrieved' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(@Query() query: PermissionQueryDto): Promise<unknown> {
    return this.permissionService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get permission by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permission found' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  async findById(@Param('id') id: string): Promise<unknown> {
    return this.permissionService.findById(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update permission' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permission updated' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Code is not in the catalog',
  })
  async update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ): Promise<unknown> {
    return this.permissionService.update(id, updatePermissionDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate permission' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permission deactivated' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  async deactivate(@Param('id') id: string): Promise<unknown> {
    return this.permissionService.deactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unassigned permission' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Permission deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Permission is still assigned to a role',
  })
  async delete(@Param('id') id: string): Promise<void> {
    await this.permissionService.delete(id);
  }
}
