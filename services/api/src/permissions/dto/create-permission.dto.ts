import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ example: 'products:create' })
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty({ example: 'Create new products', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
