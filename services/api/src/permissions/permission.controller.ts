import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PermissionService } from './permission.service.js';
import { CreatePermissionDto } from './dto/create-permission.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';
import { PermissionQueryDto } from './dto/permission-query.dto.js';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new permission' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Permission created successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Permission code already exists' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  async create(@Body() createPermissionDto: CreatePermissionDto): Promise<any> {
    return this.permissionService.create(createPermissionDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List permissions with pagination and filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permissions retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(@Query() query: any): Promise<any> {
    return this.permissionService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get permission by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permission found' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Permission not found' })
  async findById(@Param('id') id: string): Promise<any> {
    const permission = await this.permissionService.findById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    return permission;
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update permission' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permission updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Permission not found' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Permission code already exists' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  async update(@Param('id') id: string, @Body() updatePermissionDto: any): Promise<any> {
    return this.permissionService.update(id, updatePermissionDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate permission' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permission deactivated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Permission not found' })
  async deactivate(@Param('id') id: string): Promise<any> {
    return this.permissionService.deactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete permission' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Permission deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Permission not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.permissionService.delete(id);
  }
}