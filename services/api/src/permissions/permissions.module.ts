import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { PermissionRepository } from './permission.repository.js';
import { PrismaPermissionRepository } from './prisma-permission.repository.js';
import { PermissionService } from './permission.service.js';
import { PermissionController } from './permission.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PermissionController],
  providers: [
    PermissionService,
    {
      provide: PermissionRepository,
      useClass: PrismaPermissionRepository,
    },
  ],
  exports: [PermissionService, PermissionRepository],
})
export class PermissionsModule {}
