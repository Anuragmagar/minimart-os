import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeDecimal } from './create-product.dto.js';

const MONEY_14_2 = /^\d{1,12}(\.\d{1,2})?$/;
const QUANTITY_14_3 = /^\d{1,11}(\.\d{1,3})?$/;

/**
 * Every field is optional and only the fields actually present are written, so
 * an omitted field is left exactly as it was rather than being reset. A field
 * sent as an explicit `null` is cleared: the four references and the four
 * numeric columns are all nullable in the schema, and the service tests each
 * one for `undefined` rather than for truthiness so `null` is never mistaken for
 * "not supplied".
 */
export class UpdateProductDto {
  @ApiProperty({ example: 'Coca-Cola 500ml Bottle', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({
    example: 'COK-500',
    required: false,
    description:
      'Unique within the organization. Stored exactly as supplied. Editing a ' +
      'SKU does not rewrite historical sales, because sale items carry their ' +
      'own name, SKU and barcode snapshots (BR-008).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @ApiProperty({ example: 'Glass bottle, carbonated', required: false })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string | null;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  taxCategoryId?: string | null;

  @ApiProperty({ example: '45.50', required: false })
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

  @ApiProperty({ example: '10.000', required: false })
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

  /**
   * A product is deactivated through `PUT /products/:id/deactivate`, which also
   * writes its own audit action. Accepting `status` here as well matches the
   * category, brand and unit update DTOs and is how a product is reactivated
   * after being deactivated.
   */
  @ApiProperty({ enum: ['active', 'inactive'], required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
