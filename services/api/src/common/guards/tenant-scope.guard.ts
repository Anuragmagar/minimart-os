import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';

export const TENANT_SCOPE_KEY = 'tenantScope';

export interface TenantScopeOptions {
  /**
   * When true the route carries a store selector that must resolve to a store
   * the caller is authorized for. The selector is a *target* of the operation,
   * never proof of access: it is checked against the stores already granted to
   * the principal on the server, so an untrusted store id is rejected rather
   * than trusted.
   */
  store?: boolean;
}

export const RequireTenantScope = (
  options?: TenantScopeOptions,
): MethodDecorator & ClassDecorator =>
  SetMetadata(TENANT_SCOPE_KEY, { store: options?.store ?? false });

/**
 * Reads the store selector from the route or query string only.
 *
 * The request body is deliberately excluded: a body field is attacker-supplied
 * data, not a request target, and reading it would let a caller point an
 * otherwise store-less endpoint at an arbitrary store. Callers that need a
 * body store id must authorize it explicitly in the service layer.
 */
function storeSelectorFrom(request: Request): string | undefined {
  const fromParams = request.params?.storeId;
  if (typeof fromParams === 'string' && fromParams.length > 0) {
    return fromParams;
  }
  const fromQuery = request.query?.storeId;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    return fromQuery;
  }
  return undefined;
}

@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const tenantScope = this.reflector.getAllAndOverride<TenantScopeOptions>(
      TENANT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!tenantScope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user || !user.organizationId) {
      // Fail closed: an unauthenticated principal never gets tenant scope.
      throw new ForbiddenException('Authentication required');
    }

    if (tenantScope.store) {
      const storeId = storeSelectorFrom(request);

      if (!storeId) {
        throw new ForbiddenException('Store ID required for this operation');
      }

      const authorized = (user.storeAccess ?? []).some(
        (store) => store.id === storeId,
      );
      if (!authorized) {
        throw new ForbiddenException('User does not have access to this store');
      }
    }

    return true;
  }
}
