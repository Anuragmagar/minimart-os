import type { PrismaTx } from '../database/prisma.service.js';
import type { StoreAccessQueryDto } from './dto/store-access-query.dto.js';

export interface StoreAccessRecord {
  id: string;
  userId: string;
  storeId: string;
}

export interface StoreAccessWithRelations extends StoreAccessRecord {
  user: { id: string; name: string; email: string | null };
  store: { id: string; name: string; code: string };
}

/**
 * user_store_access carries no organizationId of its own, so every read and
 * write must be scoped through the owning user (or store) organization. The
 * organization is always supplied by the caller's tenant context.
 */
export abstract class StoreAccessRepository {
  abstract findByIdInOrganization(
    id: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<StoreAccessRecord | null>;
  abstract findByUserAndStore(
    userId: string,
    storeId: string,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<StoreAccessRecord | null>;
  abstract findAllInOrganization(
    query: StoreAccessQueryDto,
    organizationId: string,
    tx?: PrismaTx,
  ): Promise<{
    data: StoreAccessWithRelations[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>;
  abstract create(
    data: { userId: string; storeId: string },
    tx?: PrismaTx,
  ): Promise<StoreAccessRecord>;
  abstract delete(id: string, tx?: PrismaTx): Promise<void>;
}
