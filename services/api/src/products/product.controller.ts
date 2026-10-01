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
import { ProductService } from './product.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';
import { ProductResponseDto } from './dto/product-response.dto.js';

// Products are catalog master data at the head of the catalog chain in
// brain/BRAIN.md ("Organization -> Products -> Categories -> Brands -> Units").
// They reuse the `products:manage` code introduced in 05.01, exactly as the
// brand, unit and conversion modules did (ASM-048, ASM-051). The catalog also
// contains `products:create`, `products:update` and `products:deactivate`, which
// remain unused by decision: splitting read from write for the product master
// alone would make it the only catalog entity with separate permissions, and a
// permission code is a business-rule change rather than an implementation detail.
//
// Tenant scope is organization-only and carries no store. `products` has no
// store column: BR-004 puts inventory at a store through inventory locations,
// and a product is shared by every store in the organization.
@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
@RequirePermissions(PERMISSION.productsManage)
@RequireTenantScope()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a product in the caller organization' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: ProductResponseDto,
    description: 'Product created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Product SKU already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'A category, brand, unit or tax category is not part of this organization, ' +
      'or a price or quantity is negative or beyond its stored scale',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing products:manage',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Body() createProductDto: CreateProductDto,
  ): Promise<unknown> {
    return this.productService.create(ctx, createProductDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List products in the caller organization' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Products retrieved' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: ProductQueryDto,
  ): Promise<unknown> {
    return this.productService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a product in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ProductResponseDto,
    description: 'Product found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.productService.findById(ctx, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a product in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ProductResponseDto,
    description: 'Product updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Product SKU already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'A category, brand, unit or tax category is not part of this organization',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<unknown> {
    return this.productService.update(ctx, id, updateProductDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a product without touching its history',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ProductResponseDto,
    description: 'Product deactivated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async deactivate(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.productService.deactivate(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a product that no history references',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Product deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Product has sales, inventory, purchasing or price history; deactivate it instead',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.productService.delete(ctx, id);
  }
}
