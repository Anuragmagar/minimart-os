import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
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
import { CategoriesModule } from './categories/categories.module.js';
import { BrandsModule } from './brands/brands.module.js';
import { UnitsModule } from './units/units.module.js';
import { UnitConversionsModule } from './unit-conversions/unit-conversions.module.js';

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
    CategoriesModule,
    BrandsModule,
    UnitsModule,
    UnitConversionsModule,
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
  ],
})
export class AppModule {}
