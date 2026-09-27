import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrimaryUpiProvider } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

// BA spec: serial number, merchant id and store POS code are numeric; the Pine Labs token and IMEI
// are alphanumeric. Empty strings stay allowed so a saved value can be cleared.
const numericPattern = /^$|^[0-9]+$/;
const numericMessage = 'Use digits only.';
const alphanumericPattern = /^$|^[A-Za-z0-9-]+$/;
const alphanumericMessage = 'Use letters, numbers or hyphens only.';

export class CreatePaymentMachineDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ example: '23f9a533-5456-42a5-a926-28084c5f6d4f' })
  @IsUUID()
  posDeviceId!: string;

  @ApiProperty({ example: 'Pine Labs Terminal 1' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '1491325569' })
  @IsOptional()
  @IsString()
  @Matches(numericPattern, { message: numericMessage })
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ example: '216344' })
  @IsOptional()
  @IsString()
  @Matches(numericPattern, { message: numericMessage })
  @MaxLength(150)
  pinelabMerchantId?: string;

  @ApiPropertyOptional({
    description:
      'Sensitive setup value. Responses mask this field; production should move it to Key Vault or encrypted storage.',
    example: 'secret-token',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pinelabSecurityToken?: string;

  @ApiPropertyOptional({ example: 'IMEI001122334455' })
  @IsOptional()
  @IsString()
  @Matches(alphanumericPattern, { message: alphanumericMessage })
  @MaxLength(100)
  pinelabImei?: string;

  @ApiPropertyOptional({ example: '473174498' })
  @IsOptional()
  @IsString()
  @Matches(numericPattern, { message: numericMessage })
  @MaxLength(150)
  pinelabMerchantStorePosCode?: string;

  @ApiPropertyOptional({ enum: PrimaryUpiProvider })
  @IsEnum(PrimaryUpiProvider)
  @IsOptional()
  primaryUpi?: PrimaryUpiProvider;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Marks this machine as the default terminal for its POS device. Only one live machine per POS device can hold it.',
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
