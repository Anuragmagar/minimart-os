import { ApiProperty } from '@nestjs/swagger';

/**
 * No product name or SKU is joined in. The route is already nested under a
 * product, and the barcode is a lookup key rather than a display field, so
 * joining the parent would return the same value on every row of the collection
 * and would couple the barcode wire shape to the product one (BR-008: an item
 * carries its own name, SKU and barcode snapshot, not a live join).
 */
export class BarcodeResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  organizationId: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  productId: string;

  @ApiProperty({ example: '5000112637922' })
  barcode: string;

  @ApiProperty({ example: 'EAN13', nullable: true })
  barcodeType?: string | null;

  @ApiProperty({ example: true })
  isPrimary: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
