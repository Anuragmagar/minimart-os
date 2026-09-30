import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PasswordService } from './password.service.js';
import { JwtService } from './jwt.service.js';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { RefreshResponseDto } from './dto/refresh-response.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: loginDto.email },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await this.passwordService.verify(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // The organization comes from the user row, never from the request. No store
    // is placed in the token: store scope is authorized per request against the
    // stores granted to the user, so a token can never carry a stale store claim.
    const orgId = user.organizationId;

    const accessToken = await this.jwtService.generateAccessToken({
      sub: user.id,
      orgId,
    });

    const refreshToken = await this.jwtService.generateRefreshToken({
      sub: user.id,
      orgId,
    });

    // Store refresh token hash in database for rotation
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = this.refreshTokenExpiry();
    await this.prisma.client.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.config.accessTokenTtlSeconds,
      refreshTokenExpiresIn: this.config.refreshTokenTtlSeconds,
    };
  }

  private refreshTokenExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async refresh(refreshToken: string): Promise<RefreshResponseDto> {
    const payload = await this.jwtService.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Hash the incoming refresh token to look it up
    const tokenHash = this.hashToken(refreshToken);

    // Find the refresh token in database
    const storedToken = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Check if token is revoked or expired
    if (storedToken.revoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found or deactivated');
    }

    const orgId = user.organizationId;

    const accessToken = await this.jwtService.generateAccessToken({
      sub: user.id,
      orgId,
    });

    const newRefreshToken = await this.jwtService.generateRefreshToken({
      sub: user.id,
      orgId,
    });

    // Rotation must be single-use and atomic. Revoking first and creating second
    // outside a transaction would let two concurrent refreshes of the same token
    // both observe an unrevoked row and each mint a fresh session (AGENTS.md 21/22),
    // so the conditional claim and the insert commit together or not at all.
    const newTokenHash = this.hashToken(newRefreshToken);
    const expiresAt = this.refreshTokenExpiry();

    await this.prisma.runInTransaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: storedToken.id, revoked: false },
        data: { revoked: true },
      });

      if (claimed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          tokenHash: newTokenHash,
          expiresAt,
        },
      });
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresIn: this.config.accessTokenTtlSeconds,
      refreshTokenExpiresIn: this.config.refreshTokenTtlSeconds,
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke the token
    await this.prisma.client.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    return { message: 'Logged out successfully' };
  }
}
