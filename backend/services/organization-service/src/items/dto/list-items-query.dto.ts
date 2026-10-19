import { ApiPropertyOptional } from '@nestjs/swagger';
import { FoodType, ItemType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';
import { toOptionalBoolean } from '../../common/values';

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

  @ApiPropertyOptional({
    description: 'With itemType: also items not mapped yet (no type), for the mapping screens.',
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  includeUnmapped?: boolean;

  @ApiPropertyOptional({ default: 'createdAt', enum: itemSortFields })
  @IsIn(itemSortFields)
  @IsOptional()
  sortBy?: ItemSortField;
}
