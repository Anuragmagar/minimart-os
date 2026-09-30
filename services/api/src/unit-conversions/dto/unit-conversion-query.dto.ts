import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UnitConversionQueryDto {
  /**
   * Conversions are addressed by direction rather than by free-text search: the
   * question a caller asks is "what does unit X convert to", which is a
   * foreign-key filter. No `search` field is offered because nothing in the
   * brain says a conversion has a searchable label of its own, and matching on
   * the joined unit names would be an invented behaviour.
   */
  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  fromUnitId?: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  toUnitId?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiProperty({ example: 20, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiProperty({ enum: ['asc', 'desc'], required: false })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
