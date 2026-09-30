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
import { UnitConversionService } from './unit-conversion.service.js';
import { CreateUnitConversionDto } from './dto/create-unit-conversion.dto.js';
import { UpdateUnitConversionDto } from './dto/update-unit-conversion.dto.js';
import { UnitConversionQueryDto } from './dto/unit-conversion-query.dto.js';
import { UnitConversionResponseDto } from './dto/unit-conversion-response.dto.js';

// Conversions are the edges of the unit graph and part of the same catalog as
// units themselves, so they reuse the `products:manage` code from 05.01
// (ASM-048) rather than adding a new permission.
@ApiTags('Unit Conversions')
@ApiBearerAuth()
@Controller('unit-conversions')
@RequirePermissions(PERMISSION.productsManage)
@RequireTenantScope()
export class UnitConversionController {
  constructor(private readonly conversionService: UnitConversionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a conversion in the caller organization',
    description:
      'Records how many toUnit make up one fromUnit. Self-conversion, ' +
      'non-positive multipliers, duplicate directions, and edges that would ' +
      'close a cycle are refused.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: UnitConversionResponseDto,
    description: 'Conversion created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A conversion for this direction already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Self-conversion, non-positive multiplier, or the edge would create a cycle',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Source or target unit not found in the caller organization',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing products:manage',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Body() createUnitConversionDto: CreateUnitConversionDto,
  ): Promise<unknown> {
    return this.conversionService.create(ctx, createUnitConversionDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List conversions in the caller organization' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Conversions retrieved' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'fromUnitId', required: false, type: String })
  @ApiQuery({ name: 'toUnitId', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: UnitConversionQueryDto,
  ): Promise<unknown> {
    return this.conversionService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a conversion in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UnitConversionResponseDto,
    description: 'Conversion found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversion not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.conversionService.findById(ctx, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the multiplier of a conversion',
    description:
      'Only the multiplier is editable. The direction is the identity of the ' +
      'row, so a direction change is a delete plus a create.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UnitConversionResponseDto,
    description: 'Conversion updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversion not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Multiplier is not greater than zero',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
    @Body() updateUnitConversionDto: UpdateUnitConversionDto,
  ): Promise<unknown> {
    return this.conversionService.update(ctx, id, updateUnitConversionDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a conversion',
    description:
      'The model has no status column, so there is no deactivation route. ' +
      'Deleting a conversion may make a unit unreachable from others, which is ' +
      'why only products:manage is permitted.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Conversion deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversion not found',
  })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.conversionService.delete(ctx, id);
  }
}
