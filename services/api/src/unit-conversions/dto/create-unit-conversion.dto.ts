import { IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * `unit_conversions.multiplier` is `DECIMAL(14,6)`, so a factor carries at most
 * 8 integer digits and 6 decimal places. The pattern below enforces that shape
 * without a sign and without exponent notation, so `"1e-7"` and `"-2"` are
 * rejected at the edge instead of reaching PostgreSQL.
 *
 * A JSON number is accepted and stringified so a client may send `12` or `"12"`
 * interchangeably. JSON has already parsed a number to a double by the time it
 * reaches this transform, so a client that needs the sixth decimal place to
 * survive intact must send a string.
 */
const DECIMAL_14_6 = /^\d{1,8}(\.\d{1,6})?$/;

export function normalizeDecimal(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  return value;
}

export class CreateUnitConversionDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Unit the quantity is expressed in. The multiplier answers "how many ' +
      'toUnit for one fromUnit", so DOZ -> PCS 12 means one dozen is twelve ' +
      'pieces. Derived from the seeded conversions, not from a brain rule.',
  })
  @IsUUID()
  fromUnitId: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Unit the quantity converts into. Must belong to the same organization ' +
      'and must differ from fromUnitId.',
  })
  @IsUUID()
  toUnitId: string;

  @ApiProperty({
    example: '12',
    description:
      'How many toUnit make up one fromUnit. Serialized as an exact decimal ' +
      'string, never a float. Must be greater than zero; the format is checked ' +
      'here and the sign is checked by the service so the error names the reason.',
  })
  @Transform(({ value }) => normalizeDecimal(value))
  @Matches(DECIMAL_14_6, {
    message:
      'multiplier must be a positive decimal with at most 8 integer digits and 6 decimal places, sent as a number or a string',
  })
  multiplier: string;
}
