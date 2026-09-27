import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const kitchenItemSortFields = ['createdAt', 'isActive', 'updatedAt'] as const;

export type KitchenItemSortField = (typeof kitchenItemSortFields)[number];

export class ListKitchenItemsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  kitchenId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: kitchenItemSortFields })
  @IsIn(kitchenItemSortFields)
  @IsOptional()
  sortBy?: KitchenItemSortField;
}
