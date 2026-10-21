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
import { DisplayName } from '../../common/display-name.decorator';

// BA spec: name and code are alphanumeric. Spaces and the separators already used by
// live device codes (6th_Floor_Counter, MAX-LKO-POS-01) are allowed alongside letters and digits.
const alphanumericPattern = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
const alphanumericMessage = 'Use letters, numbers, spaces, dots, hyphens or underscores only.';
// A host name as the network knows it (RFC 1123): dot-separated parts of letters, digits and
// hyphens, each 1-63 characters and not starting or ending with a hyphen; 253 characters in all.
// Empty clears a saved one. Kept in step with the portal's form (pos-devices-tab.tsx).
export const hostNamePattern =
  /^$|^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;
const hostNameMessage =
  'Enter a valid host name: letters, numbers and hyphens, with dots between parts (e.g. MAX-LKO-POS-01).';

export class CreatePosDeviceDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ example: 'Main Cafeteria POS' })
  @IsString()
  @Matches(alphanumericPattern, { message: alphanumericMessage })
  @MaxLength(150)
  @DisplayName()
  name!: string;

  @ApiProperty({ example: 'POS001' })
  @IsString()
  @Matches(alphanumericPattern, { message: alphanumericMessage })
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({
    description: 'The legal entity the device bills under; null removes the link.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @ApiPropertyOptional({ example: 'MAX-LKO-POS-01' })
  @IsOptional()
  @IsString()
  @Matches(hostNamePattern, { message: hostNameMessage })
  @MaxLength(253)
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
