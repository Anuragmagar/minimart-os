import { PrismaService, type PrismaTx } from './prisma.service.js';
import { PrismaClient } from '../generated/prisma/client.js';

export type PrismaClientOrTx = PrismaClient | PrismaTx;

export abstract class BaseRepository {
  protected readonly client: PrismaClient;

  protected constructor(protected readonly db: PrismaService) {
    this.client = db.client;
  }

  protected clientOrTx(tx?: PrismaTx): PrismaClientOrTx {
    return tx ?? this.client;
  }
}
