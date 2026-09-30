import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MinLength,
} from 'class-validator';
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

  @ApiProperty({
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    description: 'Permission ids from the catalog to grant this role',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
