import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service.js';

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
    storeAccess: {
      include: { store: true },
    },
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
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const payload = this.jwtService.verify(token);
      const user = await this.prisma.client.user.findUnique({
        where: { id: payload.sub },
        include: userInclude,
      }) as any;

      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('User not found or inactive');
      }

      const roles = (user.roles as Array<{ role: any }>).map((ur) => ur.role);
      const storeAccess = (user.storeAccess as Array<{ store: any }>).map((sa) => sa.store);
      const permissions = (user.roles as Array<{ role: { permissions: Array<{ permission: { code: string } }> } }>).flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code));

      request.user = {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
        status: user.status,
        roles,
        storeAccess,
        permissions,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}