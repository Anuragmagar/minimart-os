import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { lastValueFrom, Observable, of } from 'rxjs';
import { Request, Response } from 'express';
import type { IdempotencyScopeResolver } from './idempotency-scope.js';
import { IDEMPOTENCY_SCOPE_RESOLVER } from './idempotency-scope.js';
import { IdempotencyService } from './idempotency.service.js';
import { createRequestHash } from './request-hash.js';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotencyService: IdempotencyService,
    @Inject(IDEMPOTENCY_SCOPE_RESOLVER)
    private readonly scopeResolver: IdempotencyScopeResolver,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const operationKey = request.headers[IDEMPOTENCY_KEY_HEADER];

    if (typeof operationKey !== 'string' || operationKey.length === 0) {
      return next.handle();
    }

    const scope = this.scopeResolver(request);
    const requestHash = createRequestHash(
      request.method,
      request.originalUrl,
      request.body,
    );

    const outcome = await this.idempotencyService.execute({
      operationKey,
      scope,
      requestHash,
      resolveResponseStatus: () => response.statusCode,
      run: async () => lastValueFrom(next.handle()),
    });

    if (outcome.outcome === 'replayed') {
      response.status(outcome.responseStatus);
      return of(outcome.result);
    }

    return of(outcome.result);
  }
}
