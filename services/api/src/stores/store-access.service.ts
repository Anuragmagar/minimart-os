import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { StoreAccessRepository } from './store-access.repository.js';
import { GrantStoreAccessDto } from './dto/grant-store-access.dto.js';
import { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

@Injectable()
export class StoreAccessService {
  constructor(
    private readonly storeAccessRepository: StoreAccessRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findById(id: string): Promise<any> {
    return this.storeAccessRepository.findById(id);
  }

  async findAll(query: StoreAccessQueryDto): Promise<any> {
    return this.storeAccessRepository.findAll(query);
  }

  async grantAccess(grantDto: GrantStoreAccessDto): Promise<any> {
    // Check if user exists
    const user = await this.prisma.client.user.findUnique({
      where: { id: grantDto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if store exists
    const store = await this.prisma.client.store.findUnique({
      where: { id: grantDto.storeId },
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Check if access already exists
    const existing = await this.storeAccessRepository.findByUserAndStore(
      grantDto.userId,
      grantDto.storeId,
    );
    if (existing) {
      throw new ConflictException('User already has access to this store');
    }

    return this.storeAccessRepository.create({
      userId: grantDto.userId,
      storeId: grantDto.storeId,
    });
  }

  async revokeAccess(id: string): Promise<void> {
    const access = await this.storeAccessRepository.findById(id);
    if (!access) {
      throw new NotFoundException('Store access not found');
    }
    await this.storeAccessRepository.delete(id);
  }

  async revokeAccessByUserAndStore(userId: string, storeId: string): Promise<void> {
    const access = await this.storeAccessRepository.findByUserAndStore(userId, storeId);
    if (!access) {
      throw new NotFoundException('Store access not found');
    }
    await this.storeAccessRepository.delete(access.id);
  }
}