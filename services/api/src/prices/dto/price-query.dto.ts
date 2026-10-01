import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const PRICE_SORT_FIELDS = ['effectiveFrom', 'createdAt'] as const;
export type PriceSortField = (typeof PRICE_SORT_FIELDS)[number];

export class PriceQueryDto {
  @ApiProperty({
    example: 'retail',
    required: false,
    description:
      'Restrict the listing to one price series. Matched exactly as stored, so ' +
      'the caller must reproduce the same case used at creation.',
  })
  @IsOptional()
  @IsString()
  priceType?: string;

  @ApiProperty({
    example: '2026-06-15T00:00:00.000Z',
    required: false,
    description:
      'Restrict the listing to the price in force at this instant, using the ' +
      'same half-open interval as the overlap rule. Combined with priceType ' +
      'this is the "what does this product sell for" lookup the POS needs.',
  })
  @IsOptional()
  @IsDateString()
  effectiveOn?: string;

  @ApiProperty({
    example: 1,
    required: false,
    description: '1-based page number.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiProperty({
    example: 20,
    required: false,
    description:
      'Page size, capped at 200 to stay inside the pagination guidance in ' +
      'ARCHITECTURE.md. A price history is short, so the default is small.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiProperty({
    enum: PRICE_SORT_FIELDS,
    required: false,
    description:
      'Sort field, from a fixed allow-list rather than a free string, so the ' +
      'query cannot be used to reach a column outside the price history.',
  })
  @IsOptional()
  @IsEnum(PRICE_SORT_FIELDS)
  @Transform(({ value }) => (typeof value === 'string' ? value : undefined))
  sortBy?: PriceSortField = 'effectiveFrom';

  @ApiProperty({ enum: ['asc', 'desc'], required: false })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
