import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { StoreAccessRepository } from './store-access.repository.js';
import { PrismaStoreAccessRepository } from './prisma-store-access.repository.js';
import { StoreAccessService } from './store-access.service.js';
import { StoreAccessController } from './store-access.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [StoreAccessController],
  providers: [
    StoreAccessService,
    {
      provide: StoreAccessRepository,
      useClass: PrismaStoreAccessRepository,
    },
  ],
  exports: [StoreAccessService, StoreAccessRepository],
})
export class StoresModule {}