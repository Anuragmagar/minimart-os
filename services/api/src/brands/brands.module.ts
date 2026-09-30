import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BrandRepository } from './brand.repository.js';
import { PrismaBrandRepository } from './prisma-brand.repository.js';
import { BrandService } from './brand.service.js';
import { BrandController } from './brand.controller.js';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [BrandController],
  providers: [
    BrandService,
    {
      provide: BrandRepository,
      useClass: PrismaBrandRepository,
    },
  ],
  exports: [BrandService, BrandRepository],
})
export class BrandsModule {}
