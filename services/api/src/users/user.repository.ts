import type { PrismaTx } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import type { UserQueryDto } from './dto/user-query.dto.js';
import type { PaginatedResponseDto } from './dto/paginated-response.dto.js';

export abstract class UserRepository {
  abstract findById(id: string, tx?: PrismaTx): Promise<User | null>;
  abstract findByEmail(email: string, tx?: PrismaTx): Promise<User | null>;
  abstract findAll(query: UserQueryDto, tx?: PrismaTx): Promise<PaginatedResponseDto<User>>;
  abstract create(data: any, tx?: PrismaTx): Promise<any>;
  abstract update(id: string, data: any, tx?: PrismaTx): Promise<any>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}