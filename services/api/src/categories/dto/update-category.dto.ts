import {
  IsString,
  IsOptional,
  IsUUID,
  MinLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Beverages', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true,
    description:
      'Re-parents the category. Omit to leave the parent unchanged; send null ' +
      'to move the category to the root of the hierarchy.',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiProperty({ enum: ['active', 'inactive'], required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
