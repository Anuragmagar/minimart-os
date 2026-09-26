import { Module } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import {
  IdempotencyScopeResolver,
  IDEMPOTENCY_SCOPE_RESOLVER,
  resolveScopeFromRequest,
} from './idempotency-scope.js';
import { IdempotencyService } from './idempotency.service.js';

@Module({
  providers: [
    IdempotencyService,
    IdempotencyInterceptor,
    {
      provide: IDEMPOTENCY_SCOPE_RESOLVER,
      useValue: resolveScopeFromRequest satisfies IdempotencyScopeResolver,
    },
  ],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
