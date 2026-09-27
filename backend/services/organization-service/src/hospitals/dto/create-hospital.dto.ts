import { ApiPropertyOptional } from '@nestjs/swagger';
import { OnlinePaymentOption } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIP,
  IsOptional,
  IsPostalCode,
  IsString,
  MaxLength,
} from 'class-validator';

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
  locationCode?: string;

  @ApiPropertyOptional({ example: 'MAX LUCKNOW' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Max Healthcare' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hospitalName?: string;

  @ApiPropertyOptional({ example: 'MAX' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
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
}
