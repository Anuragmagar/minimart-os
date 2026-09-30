import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { StoreAccessRepository } from './store-access.repository.js';
import { GrantStoreAccessDto } from './dto/grant-store-access.dto.js';
import { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

@Injectable()
export class StoreAccessService {
  constructor(
    private readonly storeAccessRepository: StoreAccessRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireAccessInOrganization(ctx, id, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: StoreAccessQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.storeAccessRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async grantAccess(
    ctx: TenantContext,
    grantDto: GrantStoreAccessDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    // Both the user and the store must belong to the caller's organization, so a
    // grant cannot be aimed at another tenant's user or store.
    const user = await (tx ?? this.prisma.client).user.findFirst({
      where: { id: grantDto.userId, organizationId: ctx.organizationId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const store = await (tx ?? this.prisma.client).store.findFirst({
      where: { id: grantDto.storeId, organizationId: ctx.organizationId },
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const existing = await this.storeAccessRepository.findByUserAndStore(
      grantDto.userId,
      grantDto.storeId,
      ctx.organizationId,
      tx,
    );
    if (existing) {
      throw new ConflictException('User already has access to this store');
    }

    return this.storeAccessRepository.create(
      { userId: grantDto.userId, storeId: grantDto.storeId },
      tx,
    );
  }

  async revokeAccess(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const access = await this.requireAccessInOrganization(ctx, id, tx);
    await this.storeAccessRepository.delete(access.id, tx);
  }

  async revokeAccessByUserAndStore(
    ctx: TenantContext,
    userId: string,
    storeId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const access = await this.storeAccessRepository.findByUserAndStore(
      userId,
      storeId,
      ctx.organizationId,
      tx,
    );
    if (!access) {
      throw new NotFoundException('Store access not found');
    }
    await this.storeAccessRepository.delete(access.id, tx);
  }

  private async requireAccessInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<{ id: string; userId: string; storeId: string }> {
    const access = await this.storeAccessRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!access) {
      throw new NotFoundException('Store access not found');
    }
    return access;
  }
}
