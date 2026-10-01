import { IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A price period records what a product's price was, so its identity and its
 * amount are immutable: `priceType`, `amount` and `effectiveFrom` cannot be
 * changed here, and a wrong amount is corrected by closing the period and
 * inserting the correct one. Retiring the period is the only edit, which is
 * exactly what superseding a price requires.
 */
export class UpdatePriceDto {
  @ApiProperty({
    example: '2026-12-31T00:00:00.000Z',
    required: false,
    description:
      'Instant to retire this price at, half-open. When omitted the period is ' +
      'left exactly as it is; when supplied it must be strictly later than the ' +
      'period effectiveFrom and must not overlap another period of the same ' +
      'price type for the same product. Send null to reopen an already-retired ' +
      'period, which is refused when it would overlap a successor.',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}
