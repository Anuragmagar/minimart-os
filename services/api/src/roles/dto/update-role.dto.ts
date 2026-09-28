import { IsString, IsOptional, IsUUID, MinLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRoleDto {
  @ApiProperty({ example: 'Manager', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ example: 'manager', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiProperty({ example: 'Store manager role', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['active', 'inactive'], required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}