import { ApiProperty } from '@nestjs/swagger';

export class TaxCategoryResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  organizationId: string;

  @ApiProperty({ example: 'VAT Standard Rate' })
  name: string;

  @ApiProperty({ example: 'VAT-STD' })
  code: string;

  @ApiProperty({
    example: '13',
    description:
      'Exact decimal string. Prisma normalizes trailing zeros away, so a stored ' +
      '13.0000 is returned as "13" and a 13.5 as "13.5".',
  })
  rate: string;

  @ApiProperty({ example: 'VAT' })
  taxType: string;

  @ApiProperty({ example: '2005-01-14T00:00:00.000Z' })
  effectiveFrom: Date;

  @ApiProperty({
    example: null,
    description: 'Null while the rate is open-ended.',
  })
  effectiveTo: Date | null;

  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  status: 'active' | 'inactive';

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
