import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from './password.service.js';
import { JwtService } from './jwt.service.js';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RefreshResponseDto } from './dto/refresh-response.dto.js';
import { LogoutDto } from './dto/logout.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
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

    // Determine organization and store from user roles
    const orgId = user.organizationId;
    let storeId: string | undefined;

    // In a real implementation, we'd determine store from userStoreAccess
    // For now, we'll leave it undefined and let the frontend handle store selection

    const accessToken = await this.jwtService.generateAccessToken({
      sub: user.id,
      orgId,
      storeId,
    });

    const refreshToken = await this.jwtService.generateRefreshToken({
      sub: user.id,
      orgId,
    });

    // Store refresh token hash in database for rotation
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 604800 * 1000); // 7 days
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
      accessTokenExpiresIn: 900, // 15 minutes
      refreshTokenExpiresIn: 604800, // 7 days
    };
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

    // Revoke the old refresh token (rotation)
    await this.prisma.client.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const orgId = user.organizationId;
    let storeId: string | undefined;

    const accessToken = await this.jwtService.generateAccessToken({
      sub: user.id,
      orgId,
      storeId,
    });

    const newRefreshToken = await this.jwtService.generateRefreshToken({
      sub: user.id,
      orgId,
    });

    // Store new refresh token hash
    const newTokenHash = this.hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 604800 * 1000); // 7 days
    await this.prisma.client.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash: newTokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
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