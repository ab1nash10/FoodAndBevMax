import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OrderSource } from '@prisma/client';
import {
  ArrayMaxSize,
  IsEnum,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PosOrderItemDto {
  @ApiProperty({ example: 'Masala Dosa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @ApiPropertyOptional({ example: 'No onion' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * A guest order from any channel, with its key in the `x-order-key` header: a POS device's key,
 * or the restaurant's order key (kiosks, QR ordering, other apps). Sending the same orderId
 * again updates that order (a retry never duplicates it); status CANCELLED takes it off the
 * kitchen screen and the board.
 */
export class PushOrderDto {
  @ApiPropertyOptional({
    description:
      "The restaurant, as in AAHAR. Required with a POS key; with a restaurant's key it must be that restaurant.",
    example: 'RST0001',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  restaurantCode?: string;

  @ApiPropertyOptional({
    description:
      'Where the order was placed. A POS key always records POS; otherwise OTHER if left out.',
    enum: OrderSource,
  })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @ApiProperty({
    description: "The sender's own unique id for the order.",
    example: 'INV-2026-000123',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  orderId!: string;

  @ApiProperty({
    description: 'The number the guest is given and the board shows.',
    example: 'A-42',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  orderNumber!: string;

  @ApiPropertyOptional({ type: [PosOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PosOrderItemDto)
  items?: PosOrderItemDto[];

  @ApiPropertyOptional({ enum: ['CANCELLED'] })
  @IsOptional()
  @IsIn(['CANCELLED'])
  status?: 'CANCELLED';
}
