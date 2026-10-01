import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ProductsModule } from '../products/products.module.js';
import { PriceRepository } from './price.repository.js';
import { PrismaPriceRepository } from './prisma-price.repository.js';
import { PriceService } from './price.service.js';
import { PriceController } from './price.controller.js';

@Module({
  // ProductsModule is imported for its exported ProductRepository only, so a
  // price can prove its parent product belongs to the caller's own organization
  // without repeating the product lookup here. Its controller registers too,
  // which is harmless because the same module is also registered directly in
  // AppModule and the two route paths do not overlap: `/products/:id` matches
  // one segment and `/products/:productId/prices` matches three.
  imports: [DatabaseModule, AuditModule, ProductsModule],
  controllers: [PriceController],
  providers: [
    PriceService,
    {
      provide: PriceRepository,
      useClass: PrismaPriceRepository,
    },
  ],
  exports: [PriceService],
})
export class PricesModule {}
