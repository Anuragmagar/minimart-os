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

export const PERMISSIONS_KEY = 'permissions';

/**
 * Requires every listed permission (AND semantics). Permission codes are the
 * catalog in brain/SECURITY.md; no code outside that catalog may be used here.
 */
export const RequirePermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const userPermissions = user.permissions ?? [];
    const missing = requiredPermissions.filter(
      (permission) => !userPermissions.includes(permission),
    );

    if (missing.length > 0) {
      // The response names the missing permission so the gap is diagnosable,
      // but never echoes any permission the caller actually holds.
      throw new ForbiddenException(
        `Missing required permissions: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
