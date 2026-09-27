import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

// BA spec: name, code and host name are alphanumeric. Spaces and the separators already used by
// live device codes (6th_Floor_Counter, MAX-LKO-POS-01) are allowed alongside letters and digits.
const alphanumericPattern = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
// Optional fields also accept an empty string so a saved value can be cleared.
const optionalAlphanumericPattern = /^$|^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
const alphanumericMessage = 'Use letters, numbers, spaces, dots, hyphens or underscores only.';

export class CreatePosDeviceDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ example: 'Main Cafeteria POS' })
  @IsString()
  @Matches(alphanumericPattern, { message: alphanumericMessage })
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'POS001' })
  @IsString()
  @Matches(alphanumericPattern, { message: alphanumericMessage })
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({ example: 'Main cafeteria entity' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  entity?: string;

  @ApiPropertyOptional({ example: 'MAX-LKO-POS-01' })
  @IsOptional()
  @IsString()
  @Matches(optionalAlphanumericPattern, { message: alphanumericMessage })
  @MaxLength(150)
  hostName?: string;

  @ApiPropertyOptional({
    description: 'Restaurants this POS device can operate for.',
    example: ['0f7e08c8-66d9-4a50-994a-7e5c91565f9d'],
    type: [String],
  })
  @ArrayUnique()
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  restaurantIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isKotPrintEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isInvoicePrintEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
