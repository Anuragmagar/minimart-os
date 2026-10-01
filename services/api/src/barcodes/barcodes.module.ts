import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ProductsModule } from '../products/products.module.js';
import { BarcodeRepository } from './barcode.repository.js';
import { PrismaBarcodeRepository } from './prisma-barcode.repository.js';
import { BarcodeService } from './barcode.service.js';
import { BarcodeController } from './barcode.controller.js';

@Module({
  // ProductsModule is imported for its exported ProductRepository only, so a
  // barcode can prove its parent product belongs to the caller's own
  // organization without repeating the product lookup here. Its controller
  // registers too, which is harmless because the same module is also registered
  // directly in AppModule, and the two route paths do not overlap:
  // `/products/:id` matches one segment and `/products/:productId/barcodes`
  // matches three.
  imports: [DatabaseModule, AuditModule, ProductsModule],
  controllers: [BarcodeController],
  providers: [
    BarcodeService,
    {
      provide: BarcodeRepository,
      useClass: PrismaBarcodeRepository,
    },
  ],
  exports: [BarcodeService],
})
export class BarcodesModule {}
