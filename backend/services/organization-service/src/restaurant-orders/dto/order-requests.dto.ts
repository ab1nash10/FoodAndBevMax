import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

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
