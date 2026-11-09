import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class QrMenuQueryDto {
  @ApiPropertyOptional({ description: "The restaurant's board link secret." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;
}

export class QrStaffOtpDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'Enter your Employee ID.' })
  employeeCode!: string;
}

export class QrStaffVerifyDto extends QrStaffOtpDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit OTP.' })
  otp!: string;
}

export class QrOrderLineDto {
  @ApiProperty()
  @IsUUID()
  menuId!: string;

  @ApiProperty({ minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;
}

export class CreateQrOrderDto {
  @ApiProperty({
    description: 'The phone’s own id for this order: sending it again is the same order.',
  })
  @IsString()
  @MaxLength(64)
  @Matches(/\S/)
  clientOrderId!: string;

  // Counter pickup is ordered at the kiosk: a QR order is always delivered to a room.
  @ApiPropertyOptional({ default: OrderChannel.ROOM, enum: [OrderChannel.ROOM] })
  @IsOptional()
  @IsIn([OrderChannel.ROOM], {
    message: 'The QR is for room delivery. Order for the counter at the kiosk.',
  })
  channel?: typeof OrderChannel.ROOM;

  @ApiProperty({ type: [QrOrderLineDto] })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => QrOrderLineDto)
  @ValidateNested({ each: true })
  lines!: QrOrderLineDto[];

  @ApiProperty({ description: 'The room the order is delivered to.' })
  @IsString()
  @MaxLength(20)
  @Matches(/\S/, { message: 'Enter your room number.' })
  roomNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bedNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @ApiPropertyOptional({ description: 'From a confirmed staff-discount OTP.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  staffToken?: string;

  @ApiPropertyOptional({ description: 'The page the payment provider sends the guest back to.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnUrl?: string;
}

export class QrOrderStatusQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  key!: string;
}
