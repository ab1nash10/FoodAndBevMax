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

const qrChannels = [OrderChannel.ROOM, OrderChannel.COUNTER, OrderChannel.TABLE] as const;
/**
 * ROOM: delivered to a patient's room. COUNTER: staff and visitors pick it up at the QR counter.
 * TABLE: served at a dine-in table, from the counter menu.
 */
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

const mobileRule = /^[6-9]\d{9}$/;

/** A guest signs in with their name and mobile; an OTP goes to that mobile. */
export class QrGuestOtpDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'Enter your name.' })
  name!: string;

  @ApiProperty({ example: '9876543210' })
  @Matches(mobileRule, { message: 'Enter a 10-digit mobile number.' })
  mobile!: string;
}

export class QrGuestVerifyDto {
  @ApiProperty({ example: '9876543210' })
  @Matches(mobileRule, { message: 'Enter a 10-digit mobile number.' })
  mobile!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit OTP.' })
  otp!: string;
}

export class QrGuestDto {
  @ApiProperty({ description: "The guest's sign-in, from guest-verify." })
  @IsString()
  @MaxLength(500)
  guestToken!: string;
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
    description:
      'ROOM: delivered to the room. COUNTER: picked up at the QR counter. TABLE: served at the table.',
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

  @ApiPropertyOptional({
    description: "A ROOM order's room: the id on the bed's QR. The restaurant's QR is pickup only.",
  })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({
    description: "A TABLE order's table: the id on the table's QR.",
  })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @ApiProperty({
    description:
      "The guest's sign-in (name and mobile, confirmed by OTP). Their name and mobile go on the order, and an employee's registered mobile gets their staff discount.",
  })
  @IsString()
  @MaxLength(500)
  guestToken!: string;

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

  @ApiProperty({
    description:
      "The guest's sign-in for this order (name and mobile, confirmed by OTP); an employee's registered mobile gets their staff discount.",
  })
  @IsString()
  @MaxLength(500)
  guestToken!: string;
}
