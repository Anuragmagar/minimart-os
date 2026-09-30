import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RefreshResponseDto } from './dto/refresh-response.dto.js';
import { LogoutDto } from './dto/logout.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: LoginResponseDto,
    description: 'Login successful',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async login(@Body() loginDto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: RefreshResponseDto,
    description: 'Token refreshed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired refresh token',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async refresh(@Body() refreshDto: RefreshDto): Promise<RefreshResponseDto> {
    return this.authService.refresh(refreshDto.refreshToken);
  }

  // Public by design: an offline terminal must always be able to drop its local
  // session. Revocation is keyed on the refresh token hash, so possession of the
  // token is the authorization. The route therefore accepts no bearer token and
  // derives no tenant scope; it can only ever revoke the one session it presents.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged out successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid refresh token',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async logout(@Body() logoutDto: LogoutDto): Promise<{ message: string }> {
    return this.authService.logout(logoutDto.refreshToken);
  }
}
