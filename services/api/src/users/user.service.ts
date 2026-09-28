import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { UserRepository } from './user.repository.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';
import { PaginatedResponseDto } from './dto/paginated-response.dto.js';
import type { PrismaTx } from '../database/prisma.service.js';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async findById(id: string, tx?: any): Promise<any> {
    return this.userRepository.findById(id, tx);
  }

  async findByEmail(email: string, tx?: any): Promise<any> {
    return this.userRepository.findByEmail(email, tx);
  }

  async findAll(query: UserQueryDto, tx?: any): Promise<any> {
    return this.userRepository.findAll(query, tx);
  }

  async create(createUserDto: CreateUserDto, tx?: any): Promise<any> {
    const existingUser = await this.userRepository.findByEmail(createUserDto.email, tx);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (createUserDto.roleId) {
      const role = await this.prisma.client.role.findUnique({
        where: { id: createUserDto.roleId },
      });
      if (!role) {
        throw new BadRequestException('Invalid roleId');
      }
    }

    if (createUserDto.storeId) {
      const store = await this.prisma.client.store.findUnique({
        where: { id: createUserDto.storeId },
      });
      if (!store) {
        throw new BadRequestException('Invalid storeId');
      }
    }

    const passwordHash = createUserDto.password
      ? await this.passwordService.hash(createUserDto.password)
      : await this.passwordService.hash('TempPassword123!');

    const { roleId, storeId, password, ...userData } = createUserDto;

    return this.prisma.client.user.create({
      data: {
        ...userData,
        passwordHash,
        roleId: createUserDto.roleId,
        organizationId: '', // Will be set from context in real implementation
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, tx?: any): Promise<any> {
    const user = await this.userRepository.findById(id, tx);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(updateUserDto.email, tx);
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('User with this email already exists');
      }
    }

    if (updateUserDto.roleId) {
      const role = await this.prisma.client.role.findUnique({
        where: { id: updateUserDto.roleId },
      });
      if (!role) {
        throw new BadRequestException('Invalid roleId');
      }
    }

    if (updateUserDto.storeId) {
      const store = await this.prisma.client.store.findUnique({
        where: { id: updateUserDto.storeId },
      });
      if (!store) {
        throw new BadRequestException('Invalid storeId');
      }
    }

    const { roleId, storeId, ...updateData } = updateUserDto;
    return this.userRepository.update(id, updateData, tx);
  }

  async deactivate(id: string, tx?: any): Promise<any> {
    const user = await this.userRepository.findById(id, tx);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userRepository.update(id, { status: 'inactive' }, tx);
  }

  async delete(id: string, tx?: any): Promise<void> {
    const user = await this.userRepository.findById(id, tx);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.userRepository.delete(id, tx);
  }
}