import {
  IsString,
  IsOptional,
  IsDateString,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * `tax_categories.rate` is `NUMERIC(14,4)` (ASM-015), so a rate value carries at
 * most 10 integer digits and 4 decimal places.
 *
 * The pattern admits no sign, so a negative rate is rejected at the edge. There
 * is no business cap: a rate above 100 is a legitimate thing for an operator to
 * configure in a jurisdiction they know better than this system does, and the
 * user was asked and chose the column's own limit rather than an invented
 * ceiling. Zero is allowed, because a zero-rated or exempt category is exactly
 * how such a category is expressed. Exponent notation is refused so `1e-7` cannot
 * slip past the scale limit.
 */
const RATE_14_4 = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * Accepts a JSON number as well as a string, matching the wire contract chosen
 * for money in 05.05 and conversion factors in 05.04. JSON has already parsed a
 * number to a double by the time it reaches this transform, so a client that
 * needs the stored scale preserved intact must send a string.
 */
export function normalizeRate(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  return value;
}

export class CreateTaxCategoryDto {
  @ApiProperty({ example: 'VAT Standard Rate' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    example: 'VAT-STD',
    description:
      'Organization-scoped tax code, unique within the organization. Stored ' +
      'exactly as supplied; no case normalization is applied because no brain ' +
      'document defines one. Editable after creation, with the same ' +
      'organization-wide duplicate check the unit code uses.',
  })
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty({
    example: '13.0000',
    description:
      'Percentage rate, NUMERIC(14,4): zero or greater, at most 10 integer ' +
      'digits and 4 decimal places, sent as a number or a string. No business ' +
      'cap is applied. Returned as an exact decimal string with trailing zeros ' +
      'normalized away by Prisma, so 13.0000 arrives as "13".',
  })
  @Transform(({ value }) => normalizeRate(value))
  @Matches(RATE_14_4, {
    message:
      'rate must be zero or greater with at most 10 integer digits and 4 decimal places, sent as a number or a string',
  })
  rate: string;

  @ApiProperty({
    example: 'VAT',
    description:
      'Tax type label, free text. No authoritative value list exists for Nepal ' +
      'tax types and AGENTS.md 5 forbids inventing one, so this is not an enum ' +
      'and nothing in the system branches on it (ASM-015d).',
  })
  @IsString()
  @MinLength(1)
  taxType: string;

  @ApiProperty({
    example: '2005-01-14',
    description:
      'Date this rate takes effect. Required, and may be in the past or the ' +
      'future: an operator can configure a rate before it applies, and BR-036 ' +
      'only requires the behavior to be effective-dated.',
  })
  @IsDateString()
  effectiveFrom: string;

  @ApiProperty({
    example: null,
    required: false,
    description:
      'Date this rate stops applying. Optional, and null means the rate is ' +
      'open-ended. When supplied it must be strictly later than effectiveFrom.',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}
