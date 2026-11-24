import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';

export class ListRestaurantOrdersQueryDto {
  @ApiProperty()
  @IsUUID()
  restaurantId!: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

export class BoardLinkDto {
  @ApiPropertyOptional({ description: 'Replace the link; the old one stops working.' })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

export class SetQrCounterDto {
  @ApiProperty({
    description: 'The counter QR orders are billed at; null turns QR ordering off.',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  counterId!: string | null;
}

/** Why a steward could not hand a room order over; the till's and kitchen's screens show it. */
export const UNDELIVERED_REASONS = [
  'Patient discharged',
  'Patient not in room',
  'Patient refused it',
] as const;

export class MarkDeliveredDto {
  @ApiPropertyOptional({
    description: "A phone order's six digits, scanned from the guest's QR or typed.",
    example: '482913',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'The code is six digits.' })
  code?: string;
}

export class NotDeliveredDto {
  @ApiProperty({ enum: UNDELIVERED_REASONS })
  @IsIn(UNDELIVERED_REASONS)
  reason!: (typeof UNDELIVERED_REASONS)[number];
}

export class SetStewardDto {
  @ApiProperty({
    description: 'The steward (a Delivery Operator); null takes the order off them.',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  stewardId!: string | null;
}
