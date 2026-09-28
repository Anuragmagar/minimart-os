import { Module } from '@nestjs/common';
import { PasswordService } from './password.service.js';
import { JwtService } from './jwt.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';

@Module({
  providers: [PasswordService, JwtService, AuthService],
  exports: [PasswordService, JwtService, AuthService],
  controllers: [AuthController],
})
export class AuthModule {}