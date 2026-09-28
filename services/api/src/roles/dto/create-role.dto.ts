import { IsString, IsOptional, IsUUID, MinLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'Manager' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'manager' })
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty({ example: 'Store manager role', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}