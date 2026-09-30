import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@minimart.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MinimartDev@123' })
  @IsString()
  @MinLength(1)
  password: string;
}
