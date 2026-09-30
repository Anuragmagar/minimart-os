import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UnitRepository } from './unit.repository.js';
import { PrismaUnitRepository } from './prisma-unit.repository.js';
import { UnitService } from './unit.service.js';
import { UnitController } from './unit.controller.js';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [UnitController],
  providers: [
    UnitService,
    {
      provide: UnitRepository,
      useClass: PrismaUnitRepository,
    },
  ],
  exports: [UnitService, UnitRepository],
})
export class UnitsModule {}
