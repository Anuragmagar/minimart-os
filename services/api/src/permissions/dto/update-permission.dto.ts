import { IsString, IsOptional, MinLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePermissionDto {
  @ApiProperty({ example: 'products:read', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiProperty({ example: 'View products list', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['active', 'inactive'], required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
