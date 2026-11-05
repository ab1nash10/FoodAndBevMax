import { ApiPropertyOptional } from '@nestjs/swagger';
import { OnlinePaymentOption } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIP,
  IsOptional,
  IsPostalCode,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CodeCase, DisplayName } from '../../common/display-name.decorator';

export class CreateHospitalDto {
  @ApiPropertyOptional({
    description: 'Business-facing Location title. Maps to hospitalName internally.',
    example: 'MAX LUCKNOW',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Business-facing Location code. Maps to hospitalCode internally.',
    example: 'ML29225',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @CodeCase()
  locationCode?: string;

  @ApiPropertyOptional({ example: 'MAX LUCKNOW' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @DisplayName()
  displayName?: string;

  @ApiPropertyOptional({ example: 'Max Healthcare' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @DisplayName()
  hospitalName?: string;

  @ApiPropertyOptional({ example: 'MAX' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @CodeCase()
  hospitalCode?: string;

  @ApiPropertyOptional({ example: 'Gomti Nagar, Lucknow' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Lucknow' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Uttar Pradesh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '226010' })
  @IsOptional()
  @IsPostalCode('IN')
  postalCode?: string;

  @ApiPropertyOptional({ example: '26.8467' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  latitude?: string;

  @ApiPropertyOptional({ example: '80.9462' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  longitude?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  area?: string;

  @ApiPropertyOptional({ example: '192.168.1.10' })
  @IsIP()
  @IsOptional()
  ipAddress?: string;

  @ApiPropertyOptional({ example: 'Max Healthcare, Lucknow' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  visitingCardAddress?: string;

  @ApiPropertyOptional({ enum: OnlinePaymentOption, example: OnlinePaymentOption.NONE })
  @IsEnum(OnlinePaymentOption)
  @IsOptional()
  onlinePaymentOption?: OnlinePaymentOption;

  // The location's own gateway account. Unset, it uses the shared server keys. A secret left out
  // of an edit stays as it is; sent blank, it is cleared. Secrets are only ever returned masked.
  @ApiPropertyOptional({ description: 'PayU payment-links client id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  payuClientId?: string;

  @ApiPropertyOptional({ description: 'PayU payment-links client secret (write-only).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  payuClientSecret?: string;

  @ApiPropertyOptional({ description: 'PayU merchant id.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  payuMerchantId?: string;

  @ApiPropertyOptional({ description: 'Razorpay key id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  razorpayKeyId?: string;

  @ApiPropertyOptional({ description: 'Razorpay key secret (write-only).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  razorpayKeySecret?: string;

  @ApiPropertyOptional({ example: 'MAX-LKO' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoicePrefix?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  gstApplicable?: boolean;

  @ApiPropertyOptional({ example: 'MAX' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  billPrefix?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'The legal entity it bills under; null removes the link.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;
}
