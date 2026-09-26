import { Request } from 'express';
import { AppError } from '../common/errors/app-error.js';

export interface IdempotencyScope {
  organizationId: string;
  storeId?: string;
  userId?: string;
}

export type IdempotencyScopeResolver = (request: Request) => IdempotencyScope;

export const IDEMPOTENCY_SCOPE_RESOLVER = Symbol('IDEMPOTENCY_SCOPE_RESOLVER');

export function resolveScopeFromRequest(request: Request): IdempotencyScope {
  const context = (request as RequestWithContext).context as
    IdempotencyScope | undefined;
  if (
    context &&
    typeof context.organizationId === 'string' &&
    context.organizationId.length > 0
  ) {
    return context;
  }
  throw new AppError({
    code: 'IDEMPOTENCY_SCOPE_UNAVAILABLE',
    message:
      'Idempotency scope could not be resolved from the request context. ' +
      'The executing middleware/guard must set request.context before an idempotent endpoint runs.',
    statusCode: 500,
  });
}

interface RequestWithContext {
  context?: IdempotencyScope;
}
