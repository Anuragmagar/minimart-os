import {
  Controller,
  Get,
  Post,
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
import { StoreAccessService } from './store-access.service.js';
import { GrantStoreAccessDto } from './dto/grant-store-access.dto.js';
import { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

@ApiTags('Store Access')
@ApiBearerAuth()
@Controller('store-access')
// Granting or revoking store access changes what a user may reach, so it is
// user management and uses users:manage.
@RequirePermissions(PERMISSION.usersManage)
@RequireTenantScope()
export class StoreAccessController {
  constructor(private readonly storeAccessService: StoreAccessService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Grant user access to a store' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Store access granted',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing users:manage',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User already has access to this store',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User or store not found',
  })
  async grantAccess(
    @TenantContextParam() ctx: TenantContext,
    @Body() grantDto: GrantStoreAccessDto,
  ): Promise<unknown> {
    return this.storeAccessService.grantAccess(ctx, grantDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List store access in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Store access list retrieved',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'storeId', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: StoreAccessQueryDto,
  ): Promise<unknown> {
    return this.storeAccessService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a store access grant by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Store access found' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store access not found',
  })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.storeAccessService.findById(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke user access to a store by access ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Store access revoked',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store access not found',
  })
  async revokeById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.storeAccessService.revokeAccess(ctx, id);
  }

  @Delete('user/:userId/store/:storeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke user access to a store by user and store ID',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Store access revoked',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store access not found',
  })
  async revokeByUserAndStore(
    @TenantContextParam() ctx: TenantContext,
    @Param('userId') userId: string,
    @Param('storeId') storeId: string,
  ): Promise<void> {
    await this.storeAccessService.revokeAccessByUserAndStore(
      ctx,
      userId,
      storeId,
    );
  }
}
