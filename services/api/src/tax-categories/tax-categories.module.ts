import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { TaxCategoryRepository } from './tax-category.repository.js';
import { PrismaTaxCategoryRepository } from './prisma-tax-category.repository.js';
import { TaxCategoryService } from './tax-category.service.js';
import { TaxCategoryController } from './tax-category.controller.js';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [TaxCategoryController],
  providers: [
    TaxCategoryService,
    {
      provide: TaxCategoryRepository,
      useClass: PrismaTaxCategoryRepository,
    },
  ],
  exports: [TaxCategoryService, TaxCategoryRepository],
})
export class TaxCategoriesModule {}
