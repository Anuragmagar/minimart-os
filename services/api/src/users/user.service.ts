import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { UserRepository } from './user.repository.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireUserInOrganization(ctx, id, tx);
  }

  async findByEmail(email: string, tx?: PrismaTx): Promise<unknown> {
    return this.userRepository.findByEmail(email, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: UserQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.userRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    createUserDto: CreateUserDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const existingUser = await this.userRepository.findByEmail(
      createUserDto.email,
      tx,
    );
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (createUserDto.roleId) {
      await this.requireRoleInOrganization(ctx, createUserDto.roleId, tx);
    }

    if (createUserDto.storeId) {
      await this.requireStoreInOrganization(ctx, createUserDto.storeId, tx);
    }

    const passwordHash = await this.passwordService.hash(
      createUserDto.password,
    );

    // Explicit field mapping only. Spreading the request body into Prisma would
    // let a caller set passwordHash, lastLogin or any future column directly.
    return this.write(tx, async (write) => {
      const user = await this.userRepository.create(
        {
          organizationId: ctx.organizationId,
          email: createUserDto.email,
          name: createUserDto.name,
          phone: createUserDto.phone ?? null,
          passwordHash,
          status: 'active',
        },
        write,
      );

      if (createUserDto.roleId) {
        await write.userRole.create({
          data: { userId: user.id, roleId: createUserDto.roleId },
        });
      }

      if (createUserDto.storeId) {
        await write.userStoreAccess.create({
          data: { userId: user.id, storeId: createUserDto.storeId },
        });
      }

      return user;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    updateUserDto: UpdateUserDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const user = (await this.requireUserInOrganization(ctx, id, tx)) as {
      id: string;
      email: string | null;
    };

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(
        updateUserDto.email,
        tx,
      );
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('User with this email already exists');
      }
    }

    if (updateUserDto.roleId) {
      await this.requireRoleInOrganization(ctx, updateUserDto.roleId, tx);
    }

    if (updateUserDto.storeId) {
      await this.requireStoreInOrganization(ctx, updateUserDto.storeId, tx);
    }

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {};
      if (updateUserDto.email !== undefined) data.email = updateUserDto.email;
      if (updateUserDto.name !== undefined) data.name = updateUserDto.name;
      if (updateUserDto.phone !== undefined) data.phone = updateUserDto.phone;
      if (updateUserDto.status !== undefined)
        data.status = updateUserDto.status;

      const updated = await this.userRepository.update(id, data, write);

      if (updateUserDto.roleId) {
        await write.userRole.deleteMany({ where: { userId: id } });
        await write.userRole.create({
          data: { userId: id, roleId: updateUserDto.roleId },
        });
      }

      if (updateUserDto.storeId) {
        await write.userStoreAccess.deleteMany({ where: { userId: id } });
        await write.userStoreAccess.create({
          data: { userId: id, storeId: updateUserDto.storeId },
        });
      }

      return updated;
    });
  }

  async deactivate(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireUserInOrganization(ctx, id, tx);
    return this.userRepository.update(id, { status: 'inactive' }, tx);
  }

  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    await this.requireUserInOrganization(ctx, id, tx);

    if (id === ctx.userId) {
      throw new BadRequestException('A user cannot delete their own account');
    }

    await this.userRepository.delete(id, tx);
  }

  /**
   * Joins a caller-supplied transaction when there is one, and otherwise opens a
   * transaction so the user row and its role/store junctions commit together
   * (AGENTS.md 21). Nesting is avoided so an idempotent caller (ASM-028) can pass
   * its own transaction in.
   */
  private write<T>(
    tx: PrismaTx | undefined,
    fn: (write: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.runInTransaction(fn);
  }

  private async requireUserInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const user = await this.userRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!user) {
      // A user outside the caller's organization is reported as not found, so the
      // API does not confirm that the id exists in another tenant (BR-040).
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async requireRoleInOrganization(
    ctx: TenantContext,
    roleId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const role = await this.client(tx).role.findFirst({
      where: { id: roleId, organizationId: ctx.organizationId },
    });
    if (!role) {
      throw new BadRequestException('Invalid roleId for this organization');
    }
  }

  private async requireStoreInOrganization(
    ctx: TenantContext,
    storeId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const store = await this.client(tx).store.findFirst({
      where: { id: storeId, organizationId: ctx.organizationId },
    });
    if (!store) {
      throw new BadRequestException('Invalid storeId for this organization');
    }
  }

  private client(tx?: PrismaTx) {
    return tx ?? this.prisma.client;
  }
}
