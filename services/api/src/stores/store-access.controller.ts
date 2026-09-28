import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { StoreAccessService } from './store-access.service.js';
import { GrantStoreAccessDto } from './dto/grant-store-access.dto.js';
import { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

@ApiTags('Store Access')
@Controller('store-access')
export class StoreAccessController {
  constructor(private readonly storeAccessService: StoreAccessService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Grant user access to a store' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Store access granted successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'User already has access to this store' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User or store not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  async grantAccess(@Body() grantDto: GrantStoreAccessDto): Promise<any> {
    return this.storeAccessService.grantAccess(grantDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List store access with pagination and filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Store access list retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'storeId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(@Query() query: any): Promise<any> {
    return this.storeAccessService.findAll(query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke user access to a store by access ID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Store access revoked successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Store access not found' })
  async revokeById(@Param('id') id: string): Promise<void> {
    await this.storeAccessService.revokeAccess(id);
  }

  @Delete('user/:userId/store/:storeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke user access to a store by user and store ID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Store access revoked successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Store access not found' })
  async revokeByUserAndStore(@Param('userId') userId: string, @Param('storeId') storeId: string): Promise<void> {
    await this.storeAccessService.revokeAccessByUserAndStore(userId, storeId);
  }
}