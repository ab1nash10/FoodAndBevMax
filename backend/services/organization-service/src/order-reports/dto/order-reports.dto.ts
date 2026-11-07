import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { toOptionalBoolean } from '../../common/values';

export const orderReportSortFields = ['placedAt', 'billNumber', 'grandTotal'] as const;

export class ListOrderReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiPropertyOptional({ description: 'The till the bill was made at.' })
  @IsOptional()
  @IsUUID()
  posDeviceId?: string;

  @ApiPropertyOptional({ description: 'The user who made the bill.' })
  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @ApiPropertyOptional({ description: 'Business date from (YYYY-MM-DD).' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Business date to (YYYY-MM-DD).' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'true: only bills with a discount; false: only without.' })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  discounted?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  isComplimentary?: boolean;

  @ApiPropertyOptional({ enum: orderReportSortFields })
  @IsIn(orderReportSortFields)
  @IsOptional()
  sortBy?: (typeof orderReportSortFields)[number];
}

export class OperatorsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;
}

export class ListAmendmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;
}

export class FindAmendableQueryDto {
  @ApiProperty({ description: 'An order number (0294) or a bill number (MAXBLK/01421402).' })
  @IsString()
  @MaxLength(60)
  @Matches(/\S/, { message: 'Enter an order or bill number.' })
  q!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;
}

export class CreateAmendmentDto {
  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  paymentMode!: PaymentMode;

  @ApiPropertyOptional({
    description: 'Needed for UPI and card; dropped for cash.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: 'Enter remarks: why the bill is amended.' })
  remarks!: string;
}
