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
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/guards/permissions.guard.js';
import { RequireTenantScope } from '../common/guards/tenant-scope.guard.js';
import { PERMISSION } from '../auth/permission-codes.js';
import { TenantContextParam } from '../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { PriceService } from './price.service.js';
import { CreatePriceDto } from './dto/create-price.dto.js';
import { UpdatePriceDto } from './dto/update-price.dto.js';
import { PriceQueryDto } from './dto/price-query.dto.js';
import { PriceResponseDto } from './dto/price-response.dto.js';

// Prices are nested under the product that owns them rather than exposed as a
// top-level collection, for the reason recorded for barcodes in ASM-052:
// `product_prices` has no organization column, so the parent product is the only
// thing that can authorize the call, and nesting it makes productId a path
// segment instead of a body field a client could get wrong. A productId from
// another tenant therefore reads as a missing product, never as a missing price.
//
// They reuse `products:manage`, the code the whole catalog chain already uses in
// 05.01 to 05.05 and 05.07 (ASM-048, ASM-051, ASM-052, ASM-053). A price is
// product master data with no lifecycle of its own — a period is retired by
// setting effectiveTo, not by a status change — so a separate code would be a
// business-rule change rather than an implementation detail.
//
// Tenant scope is organization-only and carries no store, exactly as for the
// product itself: a price is a property of the product and is shared by every
// store in the organization, which is what makes one price list valid across
// stores.
//
// No "current price" endpoint is exposed here. Resolving a price to sell is the
// job of the POS and the offline catalog (Tasks 05.10 and 08.03), which already
// own that contract; a second server-side resolver here would be a weaker copy of
// it. The `effectiveOn` filter is offered instead, which answers the same
// question from the same rows those paths read.
@ApiTags('Product Prices')
@ApiBearerAuth()
@Controller('products/:productId/prices')
@RequirePermissions(PERMISSION.productsManage)
@RequireTenantScope()
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a price period to a product in the caller organization',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: PriceResponseDto,
    description: 'Price period created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'An overlapping period already exists for this price type',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing products:manage',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Body() createPriceDto: CreatePriceDto,
  ): Promise<unknown> {
    return this.priceService.create(ctx, productId, createPriceDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the price periods of a product, newest first',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [PriceResponseDto],
    description: 'Price periods retrieved',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Query() query: PriceQueryDto,
  ): Promise<unknown> {
    return this.priceService.findAll(ctx, productId, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get one price period of a product' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PriceResponseDto,
    description: 'Price period found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product or price not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.priceService.findById(ctx, productId, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retire a price period, or reopen one that has not been superseded',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PriceResponseDto,
    description: 'Price period updated',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'effectiveTo is not later than effectiveFrom',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'The change would overlap another period of the same price type',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product or price not found',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Param('id') id: string,
    @Body() updatePriceDto: UpdatePriceDto,
  ): Promise<unknown> {
    return this.priceService.update(ctx, productId, id, updatePriceDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a price period that has not started yet',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Future price period deleted',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'The price has already taken effect and must be retired instead',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product or price not found',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.priceService.delete(ctx, productId, id);
  }
}
