import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from './password.service.js';
import { JwtService } from './jwt.service.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';

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

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: 900, // 15 minutes
      refreshTokenExpiresIn: 604800, // 7 days
    };
  }
}