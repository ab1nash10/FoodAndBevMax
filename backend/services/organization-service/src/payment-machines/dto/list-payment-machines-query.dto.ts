import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrimaryUpiProvider } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  ActivePaginationQueryDto,
  toOptionalBoolean,
} from '../../common/dto/active-pagination-query.dto';

export const paymentMachineSortFields = [
  'createdAt',
  'isActive',
  'isDefault',
  'name',
  'primaryUpi',
  'serialNumber',
  'updatedAt',
] as const;

export type PaymentMachineSortField = (typeof paymentMachineSortFields)[number];

export class ListPaymentMachinesQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional({ example: '23f9a533-5456-42a5-a926-28084c5f6d4f' })
  @IsOptional()
  @IsUUID()
  posDeviceId?: string;

  @ApiPropertyOptional({ enum: PrimaryUpiProvider })
  @IsEnum(PrimaryUpiProvider)
  @IsOptional()
  primaryUpi?: PrimaryUpiProvider;

  @ApiPropertyOptional({ type: Boolean })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: paymentMachineSortFields })
  @IsIn(paymentMachineSortFields)
  @IsOptional()
  sortBy?: PaymentMachineSortField;
}
