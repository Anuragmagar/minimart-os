import {
  IsInt,
  IsOptional,
  IsString,
  IsEnum,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUnitDto {
  @ApiProperty({ example: 'Kilogram', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({
    example: 'KG',
    required: false,
    description:
      'Short unit code, unique within the organization. Stored exactly as ' +
      'supplied.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiProperty({
    example: 3,
    required: false,
    minimum: 0,
    maximum: 3,
    description:
      'Decimal places allowed for quantities in this unit, capped at the ' +
      'NUMERIC(14,3) quantity scale.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  precision?: number;

  @ApiProperty({ enum: ['active', 'inactive'], required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
