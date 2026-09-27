import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RateType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateItemPriceDto {
  @ApiProperty({
    description: 'Location/Hospital ID',
    example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80',
  })
  @IsUUID()
  hospitalId!: string;

  @ApiPropertyOptional({
    description: 'Optional restaurant-specific price. Empty means location-level price.',
    example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  restaurantId?: string | null;

  @ApiProperty({ example: '49c784e5-7b5f-4b88-88f4-155b2e0d7626' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ enum: RateType, example: RateType.NORMAL })
  @IsEnum(RateType)
  rateType!: RateType;

  @ApiProperty({ example: 40, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  price!: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isTaxInclusive?: boolean;

  @ApiPropertyOptional({
    description: 'GST percentage used when tax inclusive pricing is enabled.',
    enum: [0, 5, 12, 18],
    example: 5,
  })
  @IsIn([0, 5, 12, 18])
  @IsOptional()
  @Type(() => Number)
  gstPercent?: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsDateString()
  @IsOptional()
  effectiveTo?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
