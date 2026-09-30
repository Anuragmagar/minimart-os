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
import { BrandService } from './brand.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { BrandQueryDto } from './dto/brand-query.dto.js';
import { BrandResponseDto } from './dto/brand-response.dto.js';

// Brands are catalog master data, in the same family as categories and units
// (brain/BRAIN.md "Organization -> Products -> Categories -> Brands -> Units").
// They reuse the `products:manage` code that 05.01 introduced for categories.
// The catalog has no read-only permission code, so splitting read from write
// access would be a new code in brain/SECURITY.md and a business decision, not
// an implementation detail. Failing closed on the manage code is the same choice
// the permissions module made in 04.07.
@ApiTags('Brands')
@ApiBearerAuth()
@Controller('brands')
@RequirePermissions(PERMISSION.productsManage)
@RequireTenantScope()
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a brand in the caller organization' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: BrandResponseDto,
    description: 'Brand created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Brand name already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing products:manage',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Body() createBrandDto: CreateBrandDto,
  ): Promise<unknown> {
    return this.brandService.create(ctx, createBrandDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List brands in the caller organization' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Brands retrieved' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: BrandQueryDto,
  ): Promise<unknown> {
    return this.brandService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a brand in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: BrandResponseDto,
    description: 'Brand found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Brand not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.brandService.findById(ctx, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a brand in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: BrandResponseDto,
    description: 'Brand updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Brand not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Brand name already exists',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
    @Body() updateBrandDto: UpdateBrandDto,
  ): Promise<unknown> {
    return this.brandService.update(ctx, id, updateBrandDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a brand' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: BrandResponseDto,
    description: 'Brand deactivated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Brand not found',
  })
  async deactivate(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.brandService.deactivate(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a brand no product references' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Brand deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Brand not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Brand is still referenced by products',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.brandService.delete(ctx, id);
  }
}
