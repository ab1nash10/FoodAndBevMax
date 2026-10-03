import { ApiPropertyOptional } from '@nestjs/swagger';
import { FoodType, ItemType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const itemSortFields = [
  'createdAt',
  'hsnCode',
  'isActive',
  'itemCode',
  'itemName',
  'itemType',
  'preparationTimeMinutes',
  'type',
  'updatedAt',
] as const;

export type ItemSortField = (typeof itemSortFields)[number];

export class ListItemsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: FoodType })
  @IsEnum(FoodType)
  @IsOptional()
  type?: FoodType;

  @ApiPropertyOptional({ enum: ItemType })
  @IsEnum(ItemType)
  @IsOptional()
  itemType?: ItemType;

  @ApiPropertyOptional({ default: 'createdAt', enum: itemSortFields })
  @IsIn(itemSortFields)
  @IsOptional()
  sortBy?: ItemSortField;
}
