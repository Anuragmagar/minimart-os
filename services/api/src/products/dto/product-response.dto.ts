import { ApiProperty } from '@nestjs/swagger';

/**
 * A joined category or brand. Only the two display fields are selected, so a
 * product list row renders without a second request per parent and without
 * exposing parent bookkeeping a catalog screen has no use for.
 */
export class ProductParentRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Beverages' })
  name: string;
}

/**
 * A joined measuring unit. `code` and `precision` are what a quantity column
 * needs in order to render and round correctly; the unit's own status is not
 * part of a product row.
 */
export class ProductUnitRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'PCS' })
  code: string;

  @ApiProperty({ example: 0 })
  precision: number;
}

/**
 * A joined tax category. `rate` is deliberately not selected: it is a
 * `DECIMAL(14,4)` owned by Task 05.07, and the sale path is where a rate is
 * actually applied, so a catalog row has no use for it.
 */
export class ProductTaxCategoryRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'VAT-STD' })
  code: string;

  @ApiProperty({ example: 'VAT Standard Rate' })
  name: string;
}

/**
 * The four numeric columns are typed as strings. Money is `NUMERIC(14,2)` and
 * quantity is `NUMERIC(14,3)`, and a value such as `0.1` has no exact binary
 * representation, so JSON-encoding it as a number would hand the client
 * something that differs from what was stored. Prisma's Decimal serializes to
 * its own string form, so the e2e suite asserts the wire type is a string.
 *
 * The value is exact but the stored scale is not echoed: `Decimal.toString()`
 * normalizes trailing zeros away, so `60.00` arrives as `"60"` and `10.000` as
 * `"10"`. A client that needs a fixed number of decimals formats for display
 * from a known scale rather than expecting the column scale on the wire.
 */
export class ProductResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  organizationId: string;

  @ApiProperty({ example: 'COK-500' })
  sku: string;

  @ApiProperty({ example: 'Coca-Cola 500ml Bottle' })
  name: string;

  @ApiProperty({ example: 'Glass bottle, carbonated', nullable: true })
  description?: string | null;

  @ApiProperty({ example: '45.5', nullable: true })
  defaultPurchasePrice?: string | null;

  @ApiProperty({ example: '60', nullable: true })
  defaultSellingPrice?: string | null;

  @ApiProperty({ example: '10', nullable: true })
  reorderLevel?: string | null;

  @ApiProperty({ example: '24', nullable: true })
  reorderQuantity?: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  categoryId?: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  brandId?: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  unitId?: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  taxCategoryId?: string | null;

  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  status: 'active' | 'inactive';

  @ApiProperty({ type: ProductParentRefDto, nullable: true })
  category?: ProductParentRefDto | null;

  @ApiProperty({ type: ProductParentRefDto, nullable: true })
  brand?: ProductParentRefDto | null;

  @ApiProperty({ type: ProductUnitRefDto, nullable: true })
  unit?: ProductUnitRefDto | null;

  @ApiProperty({ type: ProductTaxCategoryRefDto, nullable: true })
  taxCategory?: ProductTaxCategoryRefDto | null;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
