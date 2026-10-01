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
import { TaxCategoryService } from './tax-category.service.js';
import { CreateTaxCategoryDto } from './dto/create-tax-category.dto.js';
import { UpdateTaxCategoryDto } from './dto/update-tax-category.dto.js';
import { TaxCategoryQueryDto } from './dto/tax-category-query.dto.js';
import { TaxCategoryResponseDto } from './dto/tax-category-response.dto.js';

// Tax categories are the tax side of catalog master data, in the same family as
// categories, brands, units, and products (brain/BRAIN.md "Organization ->
// Products -> Categories -> Brands -> Units -> Prices -> Tax Categories"). They
// reuse the `products:manage` code the catalog chain already uses (ASM-048,
// ASM-051, ASM-052). Failing closed on the manage code is the same choice the
// permissions module made in 04.07, and splitting read from write would be both
// a catalog change and a business decision rather than an implementation detail.
//
// This module manages configuration only. It never computes tax: AGENTS.md 24
// forbids hardcoding rates into business logic, so the rate here is data that the
// sale and invoice paths will read, and deciding which rate applies to a
// transaction belongs to Task 14.03.
@ApiTags('Tax Categories')
@ApiBearerAuth()
@Controller('tax-categories')
@RequirePermissions(PERMISSION.productsManage)
@RequireTenantScope()
export class TaxCategoryController {
  constructor(private readonly taxCategoryService: TaxCategoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tax category in the caller organization' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: TaxCategoryResponseDto,
    description: 'Tax category created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Tax category code already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'effectiveTo is not later than effectiveFrom',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing products:manage',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Body() createTaxCategoryDto: CreateTaxCategoryDto,
  ): Promise<unknown> {
    return this.taxCategoryService.create(ctx, createTaxCategoryDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List tax categories in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tax categories retrieved',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: TaxCategoryQueryDto,
  ): Promise<unknown> {
    return this.taxCategoryService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a tax category in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: TaxCategoryResponseDto,
    description: 'Tax category found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Tax category not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.taxCategoryService.findById(ctx, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a tax category in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: TaxCategoryResponseDto,
    description: 'Tax category updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Tax category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Tax category code already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'effectiveTo is not later than effectiveFrom',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
    @Body() updateTaxCategoryDto: UpdateTaxCategoryDto,
  ): Promise<unknown> {
    return this.taxCategoryService.update(ctx, id, updateTaxCategoryDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a tax category' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: TaxCategoryResponseDto,
    description: 'Tax category deactivated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Tax category not found',
  })
  async deactivate(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.taxCategoryService.deactivate(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tax category that nothing references' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Tax category deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Tax category not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Tax category is still referenced by products',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.taxCategoryService.delete(ctx, id);
  }
}
