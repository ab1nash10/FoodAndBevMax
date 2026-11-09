import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';

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
