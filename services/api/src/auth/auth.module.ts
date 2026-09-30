import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PasswordService } from './password.service.js';
import { JwtService } from './jwt.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard.js';
import { DatabaseModule } from '../database/database.module.js';

/**
 * The guard chain is declared here, not in AppModule, because AuthGuard depends
 * on JwtService, which is a provider of this module. An APP_GUARD registered in
 * any module is still applied to every route in the application, but it is
 * instantiated in the context of the module that declares it, so its
 * dependencies must be resolvable from here.
 *
 * Order matters: authentication runs first and attaches the principal, then
 * permissions are checked, then tenant scope.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    PasswordService,
    JwtService,
    AuthService,
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
  exports: [PasswordService, JwtService, AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
