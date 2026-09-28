import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { TenantScopeGuard } from './common/guards/tenant-scope.guard.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor.js';
import { createValidationPipe } from './common/validation/validation-pipe.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AuditModule } from './audit/audit.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { IdempotencyModule } from './idempotency/idempotency.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { UsersModule } from './users/users.module.js';
import { RolesModule } from './roles/roles.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { StoresModule } from './stores/stores.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    HealthModule,
    AuthModule,
    DatabaseModule,
    OrganizationsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    StoresModule,
    AuditModule,
    IdempotencyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useValue: createValidationPipe(),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseFormatInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantScopeGuard,
    },
  ],
})
export class AppModule {}
