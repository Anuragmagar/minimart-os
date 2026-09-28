import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const TENANT_SCOPE_KEY = 'tenantScope';

export const RequireTenantScope = (options?: { store?: boolean }) =>
  SetMetadata(TENANT_SCOPE_KEY, { store: options?.store ?? false });

@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const tenantScope = this.reflector.getAllAndOverride<{ store: boolean }>(TENANT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!tenantScope) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check organization scope
    if (!user.organizationId) {
      throw new ForbiddenException('User must belong to an organization');
    }

    // Check store scope if required
    if (tenantScope.store) {
      const storeId = request.params.storeId || request.query.storeId || request.body.storeId;

      if (!storeId) {
        throw new ForbiddenException('Store ID required for this operation');
      }

      const hasStoreAccess = user.storeAccess?.some((s: { id: string }) => s.id === storeId);

      if (!hasStoreAccess) {
        throw new ForbiddenException('User does not have access to this store');
      }
    }

    return true;
  }
}