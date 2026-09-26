import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../config/app-config.service.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export type PrismaTx = Prisma.TransactionClient;

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(private readonly config: AppConfigService) {
    const adapter = new PrismaPg({ connectionString: config.databaseUrl });
    this.client = new PrismaClient({ adapter });
  }

  async runInTransaction<T>(
    fn: (tx: PrismaTx) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    return this.client.$transaction(fn, options);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
