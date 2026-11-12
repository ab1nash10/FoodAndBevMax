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

const qrChannels = [OrderChannel.ROOM, OrderChannel.COUNTER] as const;
/** ROOM: delivered to a patient's room. COUNTER: staff and visitors pick it up at the QR counter. */
export type QrChannel = (typeof qrChannels)[number];

export class QrMenuQueryDto {
  @ApiPropertyOptional({ description: "The restaurant's board link secret." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;

  @ApiPropertyOptional({ default: OrderChannel.ROOM, enum: qrChannels })
  @IsOptional()
  @IsIn(qrChannels)
  channel?: QrChannel;
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

  @ApiPropertyOptional({
    default: OrderChannel.ROOM,
    description: 'ROOM: delivered to the room. COUNTER: picked up at the QR counter.',
    enum: qrChannels,
  })
  @IsOptional()
  @IsIn(qrChannels)
  channel?: QrChannel;

  @ApiProperty({ type: [QrOrderLineDto] })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => QrOrderLineDto)
  @ValidateNested({ each: true })
  lines!: QrOrderLineDto[];

  @ApiPropertyOptional({ description: 'The room a ROOM order is delivered to.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  roomNumber?: string;

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

export class CreateKioskPaidOrderDto {
  @ApiProperty({
    description: "The kiosk's own id for this order: sending it again is the same order.",
  })
  @IsString()
  @MaxLength(64)
  @Matches(/\S/)
  clientOrderId!: string;

  @ApiProperty({ type: [QrOrderLineDto] })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => QrOrderLineDto)
  @ValidateNested({ each: true })
  lines!: QrOrderLineDto[];

  @ApiProperty({
    description: "UPI: the gateway's QR on the kiosk; CARD: the counter's machine.",
    enum: ['CARD', 'UPI'],
  })
  @IsIn(['CARD', 'UPI'])
  method!: 'CARD' | 'UPI';

  @ApiPropertyOptional({ description: 'From a confirmed staff-discount OTP.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  staffToken?: string;
}
