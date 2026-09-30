import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { RoleRepository } from './role.repository.js';
import { PrismaRoleRepository } from './prisma-role.repository.js';
import { RoleService } from './role.service.js';
import { RoleController } from './role.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [RoleController],
  providers: [
    RoleService,
    {
      provide: RoleRepository,
      useClass: PrismaRoleRepository,
    },
  ],
  exports: [RoleService, RoleRepository],
})
export class RolesModule {}
