import { ApiProperty } from '@nestjs/swagger';

/**
 * The catalog fields of a unit, which is all the list query joins in. Declared
 * as its own shape so the generated OpenAPI document is accurate rather than an
 * open-ended object.
 */
export class UnitConversionUnitRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Dozen' })
  name: string;

  @ApiProperty({ example: 'DOZ' })
  code: string;

  @ApiProperty({ example: 0 })
  precision: number;

  @ApiProperty({ enum: ['active', 'inactive'] })
  status: string;
}

/**
 * `multiplier` is typed as a string on purpose. `unit_conversions.multiplier` is
 * `DECIMAL(14,6)`, and a value such as `0.1` has no exact binary
 * representation, so JSON-encoding it as a number would hand the client a value
 * that differs from the stored decimal. Prisma's Decimal serializes to its exact
 * string form, and the e2e suite asserts the wire type is a string.
 */
export class UnitConversionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ format: 'uuid' })
  fromUnitId: string;

  @ApiProperty({ format: 'uuid' })
  toUnitId: string;

  @ApiProperty({ example: '12' })
  multiplier: string;

  @ApiProperty({ type: UnitConversionUnitRefDto, nullable: true })
  fromUnit?: UnitConversionUnitRefDto;

  @ApiProperty({ type: UnitConversionUnitRefDto, nullable: true })
  toUnit?: UnitConversionUnitRefDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
