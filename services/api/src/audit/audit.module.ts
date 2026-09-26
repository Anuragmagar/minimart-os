import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository.js';
import { AuditService } from './audit.service.js';
import { PrismaAuditRepository } from './prisma-audit.repository.js';

@Module({
  providers: [
    {
      provide: AuditRepository,
      useClass: PrismaAuditRepository,
    },
    AuditService,
  ],
  exports: [AuditService, AuditRepository],
})
export class AuditModule {}
