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
import { UnitService } from './unit.service.js';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { UpdateUnitDto } from './dto/update-unit.dto.js';
import { UnitQueryDto } from './dto/unit-query.dto.js';
import { UnitResponseDto } from './dto/unit-response.dto.js';

// Units are catalog master data, in the same family as categories and brands
// (brain/BRAIN.md "Organization -> Products -> Categories -> Brands -> Units").
// They reuse the `products:manage` code introduced in 05.01 (ASM-048). Failing
// closed on the manage code is the same choice the permissions module made in
// 04.07, and splitting read from write would be a catalog change and a business
// decision rather than an implementation detail.
@ApiTags('Units')
@ApiBearerAuth()
@Controller('units')
@RequirePermissions(PERMISSION.productsManage)
@RequireTenantScope()
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a unit in the caller organization' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: UnitResponseDto,
    description: 'Unit created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Unit code already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'precision outside the allowed 0-3 range',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing products:manage',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Body() createUnitDto: CreateUnitDto,
  ): Promise<unknown> {
    return this.unitService.create(ctx, createUnitDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List units in the caller organization' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Units retrieved' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: UnitQueryDto,
  ): Promise<unknown> {
    return this.unitService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a unit in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UnitResponseDto,
    description: 'Unit found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unit not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.unitService.findById(ctx, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a unit in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UnitResponseDto,
    description: 'Unit updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unit not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Unit code already exists',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
    @Body() updateUnitDto: UpdateUnitDto,
  ): Promise<unknown> {
    return this.unitService.update(ctx, id, updateUnitDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a unit' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UnitResponseDto,
    description: 'Unit deactivated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unit not found',
  })
  async deactivate(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.unitService.deactivate(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a unit that nothing references' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Unit deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unit not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Unit is still referenced by products or unit conversions',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.unitService.delete(ctx, id);
  }
}
