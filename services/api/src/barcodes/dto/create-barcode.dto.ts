import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A barcode value is free text with a length bound, not a digit pattern. No
 * brain document defines an accepted format, and imposing one would be inventing
 * a business rule (AGENTS.md 5): a Nepalese mini-mart stocks EAN-13 and UPC-A
 * goods but also prints its own in-store codes for loose, weighed or bundled
 * items, and those are routinely alphanumeric (`COLD-DRINK-500ML`). The bound
 * exists only because the column is unbounded text, and an unbounded key is
 * worth refusing early.
 *
 * The value is stored exactly as supplied, with no trimming and no case
 * normalization, for the same reason a SKU is: a scanner reads the printed code
 * and the operator reads it back off the shelf label, so the stored string has
 * to be the printed string. Changing a value is done by deleting and recreating
 * the barcode rather than by editing it.
 */
export class CreateBarcodeDto {
  @ApiProperty({
    example: '5000112637922',
    description:
      'Organization-scoped barcode value, unique within the organization. ' +
      'Free text up to 64 characters: EAN, UPC, in-store and weighted codes are ' +
      'all accepted, because no format rule is documented. Stored exactly as ' +
      'supplied and immutable afterwards.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  barcode: string;

  @ApiProperty({
    example: 'EAN13',
    required: false,
    nullable: true,
    description:
      'Optional symbology label, free text up to 32 characters. Informational ' +
      'only: no behavior anywhere reads it, and no set of allowed values is ' +
      'defined, so none is imposed.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  barcodeType?: string | null;

  @ApiProperty({
    example: true,
    required: false,
    description:
      'Optional. A product has at most one primary barcode; setting this true ' +
      'demotes the barcode that was primary. No primary is required, and ' +
      'removing the primary leaves the product with none.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
