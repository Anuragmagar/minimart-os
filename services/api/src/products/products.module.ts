import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { BrandsModule } from '../brands/brands.module.js';
import { UnitsModule } from '../units/units.module.js';
import { TaxCategoriesModule } from '../tax-categories/tax-categories.module.js';
import { ProductRepository } from './product.repository.js';
import { PrismaProductRepository } from './prisma-product.repository.js';
import { ProductService } from './product.service.js';
import { ProductController } from './product.controller.js';

@Module({
  // The category, brand, unit and tax category modules are imported for their
  // exported repositories only, so a product can prove each of its optional
  // parents belongs to the caller's own organization without duplicating those
  // lookups here. Their controllers register too, which is harmless because the
  // same modules are also registered directly in AppModule.
  imports: [
    DatabaseModule,
    AuditModule,
    CategoriesModule,
    BrandsModule,
    UnitsModule,
    TaxCategoriesModule,
  ],
  controllers: [ProductController],
  providers: [
    ProductService,
    {
      provide: ProductRepository,
      useClass: PrismaProductRepository,
    },
  ],
  exports: [ProductService, ProductRepository],
})
export class ProductsModule {}
