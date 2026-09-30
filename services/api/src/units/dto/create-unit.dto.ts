import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUnitDto {
  @ApiProperty({ example: 'Kilogram' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    example: 'KG',
    description:
      'Short unit code, unique within the organization. Stored exactly as ' +
      'supplied; no case normalization is applied because no brain document ' +
      'defines one.',
  })
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty({
    example: 3,
    description:
      'Decimal places allowed for quantities in this unit. Capped at 3 because ' +
      'quantities are stored as NUMERIC(14,3) (docs/DATABASE_CONVENTIONS.md), ' +
      'so a larger precision could never be honored.',
    minimum: 0,
    maximum: 3,
  })
  @IsInt()
  @Min(0)
  @Max(3)
  precision: number;
}
