import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, OrderChannel, OrderStatus, PaymentMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { toOptionalBoolean } from '../../common/values';

export class PosMenuQueryDto {
  @ApiProperty()
  @IsUUID()
  counterId!: string;

  @ApiProperty({ enum: OrderChannel })
  @IsEnum(OrderChannel)
  channel!: OrderChannel;
}

export class PosOrderLineDto {
  @ApiProperty({ description: 'The restaurant menu item.' })
  @IsUUID()
  menuId!: string;

  @ApiProperty({ maximum: 999, minimum: 1 })
  @IsInt()
  @Max(999)
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CreatePosOrderDto {
  @ApiProperty()
  @IsUUID()
  counterId!: string;

  @ApiProperty({
    description: "The till's own id for this bill: sending it again returns the same bill.",
  })
  @IsString()
  @MaxLength(64)
  clientOrderId!: string;

  @ApiProperty({ enum: OrderChannel })
  @IsEnum(OrderChannel)
  channel!: OrderChannel;

  @ApiProperty({ type: [PosOrderLineDto] })
  @ArrayMaxSize(100)
  @ArrayMinSize(1)
  @Type(() => PosOrderLineDto)
  @ValidateNested({ each: true })
  lines!: PosOrderLineDto[];

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'customerMobile must be a 10-digit Indian mobile number' })
  customerMobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;

  @ApiPropertyOptional({ description: 'Required for a room order.' })
  @ValidateIf((dto: CreatePosOrderDto) => dto.channel === OrderChannel.ROOM)
  @IsString()
  @MaxLength(20)
  roomNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bedNumber?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isComplimentary?: boolean;

  @ApiPropertyOptional({ description: 'Required for a complimentary meal.', maxLength: 200 })
  @ValidateIf((dto: CreatePosOrderDto) => dto.isComplimentary === true)
  @IsString()
  @MaxLength(200)
  complimentaryReason?: string;

  @ApiPropertyOptional({
    description: 'Required unless the meal is complimentary.',
    enum: PaymentMode,
  })
  @ValidateIf((dto: CreatePosOrderDto) => dto.isComplimentary !== true)
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ description: 'Card slip, UPI reference or what "Other" was.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string;
}

export const posOrderSortFields = ['billNumber', 'grandTotal', 'placedAt'] as const;

export class ListPosOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  counterId?: string;

  @ApiPropertyOptional({ description: 'Business date from (YYYY-MM-DD).' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Business date to (YYYY-MM-DD).' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ enum: OrderChannel })
  @IsEnum(OrderChannel)
  @IsOptional()
  channel?: OrderChannel;

  @ApiPropertyOptional({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  @IsOptional()
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  isComplimentary?: boolean;

  @ApiPropertyOptional({ enum: posOrderSortFields })
  @IsIn(posOrderSortFields)
  @IsOptional()
  sortBy?: (typeof posOrderSortFields)[number];
}

export class PosSummaryQueryDto {
  @ApiProperty()
  @IsUUID()
  counterId!: string;

  @ApiPropertyOptional({ description: 'Business date (YYYY-MM-DD); today when omitted.' })
  @IsDateString()
  @IsOptional()
  date?: string;
}

export class CancelPosOrderDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'reason is required' })
  reason!: string;
}

export class SetMenuAvailabilityDto {
  @ApiProperty()
  @IsBoolean()
  isAvailable!: boolean;
}

export class EmployeeLookupQueryDto {
  @ApiProperty()
  @IsUUID()
  counterId!: string;

  @ApiProperty({ description: 'The Employee ID entered at the till.' })
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'code is required' })
  code!: string;
}

export class StaffDiscountRateDto {
  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiProperty({ maximum: 100, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(100)
  @Min(0)
  discountPercent!: number;
}

export class SetStaffDiscountsDto {
  @ApiProperty({ description: 'Whether the restaurant gives staff discount at all.' })
  @IsBoolean()
  staffDiscountApplicable!: boolean;

  @ApiProperty({ type: [StaffDiscountRateDto] })
  @ArrayMaxSize(10)
  @Type(() => StaffDiscountRateDto)
  @ValidateNested({ each: true })
  rates!: StaffDiscountRateDto[];
}
