import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'user@minimart.local' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone: string | null;

  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  status: 'active' | 'inactive';

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  organizationId: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', nullable: true })
  roleId: string | null;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001', nullable: true })
  storeId: string | null;
}