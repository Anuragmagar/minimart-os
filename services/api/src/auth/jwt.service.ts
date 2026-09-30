import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service.js';

@Injectable()
export class JwtService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: AppConfigService) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    this.secret = new TextEncoder().encode(jwtSecret);
  }

  async generateAccessToken(payload: {
    sub: string;
    orgId: string;
    storeId?: string;
  }): Promise<string> {
    return new SignJWT({ ...payload, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlSeconds}s`)
      .sign(this.secret);
  }

  async generateRefreshToken(payload: {
    sub: string;
    orgId: string;
  }): Promise<string> {
    // The jti makes every issued refresh token unique, so rotation never
    // re-issues a token identical to the one it is replacing.
    return new SignJWT({ ...payload, type: 'refresh', jti: randomUUID() })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.config.refreshTokenTtlSeconds}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ sub: string; orgId: string; storeId?: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      // A refresh token must never be accepted as an API bearer token.
      if (payload.type !== 'access') return null;
      return {
        sub: payload.sub as string,
        orgId: payload.orgId as string,
        storeId: (payload.storeId as string) ?? undefined,
      };
    } catch {
      return null;
    }
  }

  async verifyRefreshToken(
    token: string,
  ): Promise<{ sub: string; orgId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      if (payload.type !== 'refresh') return null;
      return { sub: payload.sub as string, orgId: payload.orgId as string };
    } catch {
      return null;
    }
  }
}
