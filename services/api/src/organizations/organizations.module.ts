import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { OrganizationRepository } from './organization.repository.js';
import { PrismaOrganizationRepository } from './prisma-organization.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: OrganizationRepository,
      useClass: PrismaOrganizationRepository,
    },
  ],
  exports: [OrganizationRepository],
})
export class OrganizationsModule {}
