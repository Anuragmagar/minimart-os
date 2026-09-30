import {
  createParamDecorator,
  InternalServerErrorException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  AuthenticatedUser,
  TenantContext,
} from '../auth/authenticated-user.js';

/**
 * Resolves the authenticated principal that AuthGuard attached to the request.
 * Throws rather than returning undefined: reaching a controller without a
 * principal means the guard chain is misconfigured, and silently continuing
 * would let the route run unscoped.
 */
function resolveUser(request: Request): AuthenticatedUser {
  const user = request.user as AuthenticatedUser | undefined;
  if (!user || !user.id || !user.organizationId) {
    throw new UnauthorizedException('Authentication required');
  }
  return user;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return resolveUser(request);
  },
);

/**
 * Tenant scope for the current request, derived from the principal only.
 * `storeId` is resolved from the request's route/query store selector but is
 * validated against the principal's authorized stores by TenantScopeGuard
 * before it can be used; a store the user cannot access never yields a
 * context. When no store selector is present the context is organization-wide.
 */
export const TenantContextParam = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = resolveUser(request);

    const rawStoreId = (data === undefined ? request.params.storeId : data) as
      string | undefined;
    const storeId = rawStoreId ?? null;

    if (storeId && !user.storeAccess.some((store) => store.id === storeId)) {
      throw new InternalServerErrorException('Store scope was not authorized');
    }

    return {
      organizationId: user.organizationId,
      userId: user.id,
      storeId,
      permissions: user.permissions,
    };
  },
);
