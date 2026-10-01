import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * `products.default_purchase_price` and `products.default_selling_price` are
 * `NUMERIC(14,2)` (docs/DATABASE_CONVENTIONS.md), so a money value carries at
 * most 12 integer digits and 2 decimal places.
 *
 * The pattern admits no sign, so a negative amount is rejected at the edge. A
 * negative price is not a payable or receivable amount in any sense, and the
 * column would happily store one, so the rule lives in the shape check rather
 * than being left to the database. Exponent notation is refused as well, so
 * `1e-7` cannot slip past the scale limit.
 */
const MONEY_14_2 = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * `products.reorder_level` and `products.reorder_quantity` are `NUMERIC(14,3)`,
 * so a quantity value carries at most 11 integer digits and 3 decimal places.
 * As with money, no sign is permitted: BR-016 keeps on-hand stock at or above
 * zero, so a negative reorder threshold could never be reached and is not a
 * meaningful ordering instruction.
 */
const QUANTITY_14_3 = /^\d{1,11}(\.\d{1,3})?$/;

/**
 * Accepts a JSON number as well as a string, matching the wire contract chosen
 * for unit conversion factors in 05.04. JSON has already parsed a number to a
 * double by the time it reaches this transform, so a client that needs the
 * stored scale preserved intact must send a string.
 */
export function normalizeDecimal(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  return value;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Coca-Cola 500ml Bottle' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    example: 'COK-500',
    description:
      'Organization-scoped stock keeping unit, unique within the ' +
      'organization. Stored exactly as supplied with no case normalization, ' +
      'because no brain document defines a casing rule. This is the only ' +
      'natural key a product has; the name is deliberately not unique, since a ' +
      'mini-mart legitimately stocks the same drink in several sizes.',
  })
  @IsString()
  @MinLength(1)
  sku: string;

  @ApiProperty({ example: 'Glass bottle, carbonated', required: false })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description:
      'Optional. Must belong to the caller organization; the foreign key only ' +
      'checks that the category exists, not whose it is (BR-040).',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description:
      'Optional measuring unit. The schema leaves it nullable because no ' +
      'documented rule requires a unit at creation; the inventory and selling ' +
      'phases are where a quantity in a unit becomes unavoidable.',
  })
  @IsOptional()
  @IsUUID()
  unitId?: string | null;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description:
      'Optional tax category. A reference only: tax category management is ' +
      'Task 05.07 and no tax rate is inferred here (AGENTS.md 24).',
  })
  @IsOptional()
  @IsUUID()
  taxCategoryId?: string | null;

  @ApiProperty({
    example: '45.50',
    required: false,
    description:
      'Master-data default purchase price, NUMERIC(14,2). Zero or greater, ' +
      'sent as a number or a string, returned as an exact decimal string with ' +
      'trailing zeros normalized away. Effective-dated price history is Task ' +
      '05.08; this is only a default.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeDecimal(value))
  @Matches(MONEY_14_2, {
    message:
      'defaultPurchasePrice must be zero or greater with at most 12 integer digits and 2 decimal places, sent as a number or a string',
  })
  defaultPurchasePrice?: string | null;

  @ApiProperty({ example: '60.00', required: false })
  @IsOptional()
  @Transform(({ value }) => normalizeDecimal(value))
  @Matches(MONEY_14_2, {
    message:
      'defaultSellingPrice must be zero or greater with at most 12 integer digits and 2 decimal places, sent as a number or a string',
  })
  defaultSellingPrice?: string | null;

  @ApiProperty({
    example: '10.000',
    required: false,
    description:
      'Optional reorder threshold, NUMERIC(14,3). Stored and returned as an ' +
      'exact decimal string; trailing zeros are not preserved on the wire. No ' +
      'replenishment rule consumes it yet.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeDecimal(value))
  @Matches(QUANTITY_14_3, {
    message:
      'reorderLevel must be zero or greater with at most 11 integer digits and 3 decimal places, sent as a number or a string',
  })
  reorderLevel?: string | null;

  @ApiProperty({ example: '24.000', required: false })
  @IsOptional()
  @Transform(({ value }) => normalizeDecimal(value))
  @Matches(QUANTITY_14_3, {
    message:
      'reorderQuantity must be zero or greater with at most 11 integer digits and 3 decimal places, sent as a number or a string',
  })
  reorderQuantity?: string | null;
}
