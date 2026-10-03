import { ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType, RateType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const itemPriceSortFields = [
  'createdAt',
  'effectiveFrom',
  'effectiveTo',
  'isActive',
  'price',
  'rateType',
  'updatedAt',
] as const;

export type ItemPriceSortField = (typeof itemPriceSortFields)[number];

export class ListItemPricesQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Location/Hospital ID' })
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
  itemId?: string;

  @ApiPropertyOptional({ enum: ItemType })
  @IsEnum(ItemType)
  @IsOptional()
  itemType?: ItemType;

  @ApiPropertyOptional({ enum: RateType })
  @IsEnum(RateType)
  @IsOptional()
  rateType?: RateType;

  @ApiPropertyOptional({
    description: 'Return prices effective on this date.',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  effectiveDate?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: itemPriceSortFields })
  @IsIn(itemPriceSortFields)
  @IsOptional()
  sortBy?: ItemPriceSortField;
}
