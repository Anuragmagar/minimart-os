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
 * `product_prices.amount` is `NUMERIC(14,2)`, so a price carries at most 12
 * integer digits and exactly 2 decimal places of stored scale.
 *
 * The pattern admits no sign, so a negative price is rejected at the edge rather
 * than reaching the column. There is no business cap: the user was asked and
 * chose the column's own limit over an invented ceiling, consistent with the
 * product default prices already validated in 05.01. Zero is allowed, because a
 * free or giveaway line is a real thing in a mini-mart and nothing in the brain
 * documents forbids it. Exponent notation is refused so `1e-7` cannot slip past
 * the scale limit, and more than 2 decimal places are refused so the value is
 * never silently rounded into the column.
 */
const AMOUNT_14_2 = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Accepts a JSON number as well as a string, matching the wire contract chosen
 * for money in 05.05, tax rates in 05.07 and conversion factors in 05.04. JSON
 * has already parsed a number to a double by the time it reaches this transform,
 * so a client that needs the stored scale preserved intact must send a string.
 */
export function normalizeAmount(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  return value;
}

export class CreatePriceDto {
  @ApiProperty({
    example: 'retail',
    description:
      'Price type label, free text. No authoritative value list exists for ' +
      'Nepali price types and AGENTS.md 5 forbids inventing one, so this is not ' +
      'an enum; the seed data uses "retail". Stored exactly as supplied: no ' +
      'case normalization is applied because no brain document defines one, so ' +
      '"Retail" and "retail" are two independent price series. Immutable after ' +
      'creation, because a period belongs to the series it was created in.',
  })
  @IsString()
  @MinLength(1)
  priceType: string;

  @ApiProperty({
    example: '150.00',
    description:
      'Price amount in NPR, NUMERIC(14,2): zero or greater, at most 12 ' +
      'integer digits and 2 decimal places, sent as a number or a string. No ' +
      'business cap is applied. Immutable after creation; a changed price is a ' +
      'new period, which is what keeps the history intact. Returned as an exact ' +
      'decimal string with trailing zeros normalized away by Prisma, so ' +
      '150.00 arrives as "150".',
  })
  @Transform(({ value }) => normalizeAmount(value))
  @Matches(AMOUNT_14_2, {
    message:
      'amount must be zero or greater with at most 12 integer digits and 2 decimal places, sent as a number or a string',
  })
  amount: string;

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
    description:
      'Instant this price starts applying. Required, and may be in the past or ' +
      'the future: an operator can schedule a price change before it takes ' +
      'effect. Immutable after creation.',
  })
  @IsDateString()
  effectiveFrom: string;

  @ApiProperty({
    example: null,
    required: false,
    description:
      'Instant this price stops applying, half-open: the period covers ' +
      '[effectiveFrom, effectiveTo), so a successor may start at exactly this ' +
      'instant without overlapping. Optional, and null or absent means the ' +
      'price is open-ended. When supplied it must be strictly later than ' +
      'effectiveFrom, and it may not overlap another period of the same price ' +
      'type for the same product.',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}
