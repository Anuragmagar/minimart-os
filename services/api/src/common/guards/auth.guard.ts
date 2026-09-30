import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { JwtService } from '../../auth/jwt.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';

/**
 * Resolves the principal and their effective permissions.
 *
 * Only *active* roles and *active* permissions contribute. A deactivated role
 * therefore revokes access immediately, and a deactivated permission is not
 * honoured even while still attached to a role.
 */
const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
  storeAccess: {
    include: { store: true },
  },
} as const;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.slice('Bearer '.length);
    const payload = await this.jwtService.verifyAccessToken(token);

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      include: userInclude,
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found or inactive');
    }

    const roles = user.roles.map((userRole) => userRole.role);
    const storeAccess = user.storeAccess.map((access) => access.store);

    const permissions = [
      ...new Set(
        roles
          .filter((role) => role.status === 'active')
          .flatMap((role) => role.permissions)
          .filter(
            (rolePermission) => rolePermission.permission.status === 'active',
          )
          .map((rolePermission) => rolePermission.permission.code),
      ),
    ].sort();

    const principal: AuthenticatedUser = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
      })),
      storeAccess: storeAccess.map((store) => ({
        id: store.id,
        code: store.code,
        name: store.name,
      })),
      permissions,
    };

    request.user = principal;
    return true;
  }
}
