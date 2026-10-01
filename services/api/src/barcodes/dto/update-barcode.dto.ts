import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * `barcode` is deliberately absent, which makes it immutable: the global
 * validation pipe runs with `forbidNonWhitelisted`, so a client that sends
 * `barcode` on an update is refused with 400 rather than silently having the
 * field dropped. This matches the decision that a conversion direction is never
 * reversed in place in 05.04, and it keeps the audited history of a barcode
 * legible, because a value that can change under an audit trail is a value an
 * auditor cannot read back. A mistyped code is corrected by deleting the
 * barcode and creating the right one, and both steps are audited.
 *
 * Every field is optional and only the fields actually present are written, so
 * an omitted field is left exactly as it was. `barcodeType` sent as an explicit
 * `null` is cleared; the service tests for `undefined` rather than truthiness so
 * `null` is never mistaken for "not supplied".
 */
export class UpdateBarcodeDto {
  @ApiProperty({
    example: 'EAN13',
    required: false,
    nullable: true,
    description:
      'Optional new symbology label. Send an explicit null to clear it. The ' +
      'barcode value itself cannot be changed here.',
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
      'Set true to make this the product primary barcode, which demotes the ' +
      'previous one in the same transaction. Set false to give up primary ' +
      'status and leave the product with none.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
