import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeRate } from './create-tax-category.dto.js';

/**
 * `tax_categories.rate` is `NUMERIC(14,4)`; see CreateTaxCategoryDto for why the
 * bound is the column's own scale with no business cap.
 */
const RATE_14_4 = /^\d{1,10}(\.\d{1,4})?$/;

export class UpdateTaxCategoryDto {
  @ApiProperty({ example: 'VAT Standard Rate', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({
    example: 'VAT-STD',
    required: false,
    description:
      'Organization-scoped tax code, unique within the organization and ' +
      'editable: nothing references a tax code as a foreign key, and the code ' +
      'is a label rather than an identity, so a change is allowed with the same ' +
      'duplicate check the unit code uses.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiProperty({
    example: '15.0000',
    required: false,
    description:
      'Percentage rate, zero or greater, at most 4 decimal places. A rate ' +
      'change edits this row in place (ASM-015b) and the previous value is ' +
      'kept in the audit log; sales snapshot the rate, so historical documents ' +
      'are unaffected either way (BR-008).',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeRate(value))
  @Matches(RATE_14_4, {
    message:
      'rate must be zero or greater with at most 10 integer digits and 4 decimal places, sent as a number or a string',
  })
  rate?: string;

  @ApiProperty({ example: 'VAT', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  taxType?: string;

  @ApiProperty({
    example: '2005-01-14',
    required: false,
    description: 'Date this rate takes effect.',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({
    example: null,
    required: false,
    description:
      'Date this rate stops applying. Sending null explicitly clears the end of ' +
      'the window, which is distinct from omitting the field and is what makes ' +
      'an open-ended rate editable after a bounded one.',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @ApiProperty({ enum: ['active', 'inactive'], required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
