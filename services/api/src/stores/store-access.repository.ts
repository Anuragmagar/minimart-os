import type { PrismaTx } from '../database/prisma.service.js';
import type { UserStoreAccess } from '../generated/prisma/client.js';
import type { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

export abstract class StoreAccessRepository {
  abstract findById(id: string, tx?: PrismaTx): Promise<any | null>;
  abstract findByUserAndStore(userId: string, storeId: string, tx?: PrismaTx): Promise<any | null>;
  abstract findAll(query: StoreAccessQueryDto, tx?: PrismaTx): Promise<any>;
  abstract create(data: { userId: string; storeId: string }, tx?: PrismaTx): Promise<any>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}