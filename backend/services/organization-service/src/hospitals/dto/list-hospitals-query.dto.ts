import { ApiPropertyOptional } from '@nestjs/swagger';
import { OnlinePaymentOption } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const hospitalSortFields = [
  'title',
  'locationCode',
  'displayName',
  'invoicePrefix',
  'hospitalName',
  'hospitalCode',
  'city',
  'state',
  'postalCode',
  'onlinePaymentOption',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;
export type HospitalSortField = (typeof hospitalSortFields)[number];

export class ListHospitalsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ enum: OnlinePaymentOption })
  @IsEnum(OnlinePaymentOption)
  @IsOptional()
  onlinePaymentOption?: OnlinePaymentOption;

  @ApiPropertyOptional({ default: 'createdAt', enum: hospitalSortFields })
  @IsIn(hospitalSortFields)
  @IsOptional()
  sortBy?: HospitalSortField;
}
