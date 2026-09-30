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
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
// Every user-management route requires users:manage. There is no "read users"
// permission in the brain/SECURITY.md catalog, so reads are gated by the same
// code rather than by a newly invented one (fail closed).
@RequirePermissions(PERMISSION.usersManage)
@RequireTenantScope()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user in the caller organization' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: UserResponseDto,
    description: 'User created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing users:manage',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async create(
    @TenantContextParam() ctx: TenantContext,
    @Body() createUserDto: CreateUserDto,
  ): Promise<unknown> {
    return this.userService.create(ctx, createUserDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List users in the caller organization' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Users retrieved' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'roleId', required: false, type: String })
  @ApiQuery({ name: 'storeId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(
    @TenantContextParam() ctx: TenantContext,
    @Query() query: UserQueryDto,
  ): Promise<unknown> {
    return this.userService.findAll(ctx, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a user in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserResponseDto,
    description: 'User found',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  async findById(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userService.findById(ctx, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a user in the caller organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserResponseDto,
    description: 'User updated',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async update(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<unknown> {
    return this.userService.update(ctx, id, updateUserDto);
  }

  @Put(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a user' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserResponseDto,
    description: 'User deactivated',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  async deactivate(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userService.deactivate(ctx, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'User deleted' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  async delete(
    @TenantContextParam() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.userService.delete(ctx, id);
  }
}
