import { IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeDecimal } from './create-unit-conversion.dto.js';

const DECIMAL_14_6 = /^\d{1,8}(\.\d{1,6})?$/;

export class UpdateUnitConversionDto {
  /**
   * Only the multiplier is editable. The direction (`fromUnitId` -> `toUnitId`)
   * is the identity of the row, because that is what
   * `@@unique([organizationId, fromUnitId, toUnitId])` is built on; redefining
   * a direction is expressed as a delete plus a create so the audit trail shows
   * a new edge rather than a silently rewritten one. No brain document governs
   * this, so it is an API surface decision, recorded in the task audit.
   */
  @ApiProperty({
    example: '12.5',
    description: 'Replacement multiplier. Must be greater than zero.',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeDecimal(value))
  @Matches(DECIMAL_14_6, {
    message:
      'multiplier must be a positive decimal with at most 8 integer digits and 6 decimal places, sent as a number or a string',
  })
  multiplier?: string;
}
