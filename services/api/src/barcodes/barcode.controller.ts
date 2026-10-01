import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
import { BarcodeService } from './barcode.service.js';
import { CreateBarcodeDto } from './dto/create-barcode.dto.js';
import { UpdateBarcodeDto } from './dto/update-barcode.dto.js';
import { BarcodeResponseDto } from './dto/barcode-response.dto.js';

// Barcodes are nested under the product that owns them rather than exposed as a
// top-level collection, so a barcode can never be created against a product the
// caller did not name, and the parent product is the scope that authorizes the
// call. They reuse `products:manage`, the code the whole catalog chain already
// uses in 05.01 to 05.05 (ASM-048, ASM-051): a barcode is product master data
// with no lifecycle of its own, so a separate code would be a business-rule
// change rather than an implementation detail. `products:create`,
// `products:update` and `products:deactivate` remain unused by the same
// decision recorded on the product controller.
//
// Tenant scope is organization-only and carries no store, exactly as for the
// product itself: a barcode is a label on a product and is shared by every
// store in the organization.
//
// Scan lookup is deliberately absent. Resolving a scanned code to a product is
// the job of the offline catalog search (Task 05.10) and the POS scan path
// (Task 08.03), which already own that contract; exposing a server-side barcode
// lookup here would be a second, weaker copy of it.
@ApiTags('Product Barcodes')
@ApiBearerAuth()
@Controller('products/:productId/barcodes')
@RequirePermissions(PERMISSION.productsManage)
@RequireTenantScope()
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a barcode to a product in the caller organization',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: BarcodeResponseDto,
    description: 'Barcode created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Barcode value already exists in the organization',
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
    @Body() createBarcodeDto: CreateBarcodeDto,
  ): Promise<unknown> {
    return this.barcodeService.create(ctx, productId, createBarcodeDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the barcodes of a product in the caller organization',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [BarcodeResponseDto],
    description: 'Barcodes retrieved, oldest first',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
  ): Promise<unknown> {
    return this.barcodeService.findAll(ctx, productId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one barcode of a product in the caller organization',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: BarcodeResponseDto,
    description: 'Barcode found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product or barcode not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.barcodeService.findById(ctx, productId, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the type or primary flag of a barcode',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: BarcodeResponseDto,
    description: 'Barcode updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product or barcode not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'An attempt to change the immutable barcode value',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Param('id') id: string,
    @Body() updateBarcodeDto: UpdateBarcodeDto,
  ): Promise<unknown> {
    return this.barcodeService.update(ctx, productId, id, updateBarcodeDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a barcode of a product' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Barcode deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product or barcode not found',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('productId') productId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.barcodeService.delete(ctx, productId, id);
  }
}
