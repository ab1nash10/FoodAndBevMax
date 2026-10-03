import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RateType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ResolveItemPriceQueryDto {
  @ApiProperty({ description: 'Location/Hospital ID' })
  @IsUUID()
  hospitalId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty({ enum: RateType })
  @IsEnum(RateType)
  rateType!: RateType;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  date?: string;
}
