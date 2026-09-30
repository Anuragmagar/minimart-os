import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UnitsModule } from '../units/units.module.js';
import { UnitConversionRepository } from './unit-conversion.repository.js';
import { PrismaUnitConversionRepository } from './prisma-unit-conversion.repository.js';
import { UnitConversionService } from './unit-conversion.service.js';
import { UnitConversionController } from './unit-conversion.controller.js';

@Module({
  // UnitsModule is imported for its exported UnitRepository only, so a
  // conversion can prove both endpoint units belong to the caller's own
  // organization without duplicating that query here.
  imports: [DatabaseModule, AuditModule, UnitsModule],
  controllers: [UnitConversionController],
  providers: [
    UnitConversionService,
    {
      provide: UnitConversionRepository,
      useClass: PrismaUnitConversionRepository,
    },
  ],
  exports: [UnitConversionService, UnitConversionRepository],
})
export class UnitConversionsModule {}
