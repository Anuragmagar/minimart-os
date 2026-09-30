import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MinLength,
  IsEnum,
} from 'class-validator';
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

  @ApiProperty({
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    description:
      'Replaces the role permission set. Omit to leave it unchanged.',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
