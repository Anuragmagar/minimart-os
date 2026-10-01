import { ApiProperty } from '@nestjs/swagger';

export class PriceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'retail' })
  priceType: string;

  @ApiProperty({
    example: '150',
    description:
      'Price amount as an exact decimal string, with trailing zeros normalized ' +
      'away by Prisma, so 150.00 arrives as "150". A JSON number is never ' +
      'returned for money.',
  })
  amount: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  effectiveFrom: string;

  @ApiProperty({
    example: null,
    description:
      'Null while the price is open-ended. The period covers ' +
      '[effectiveFrom, effectiveTo).',
  })
  effectiveTo: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
