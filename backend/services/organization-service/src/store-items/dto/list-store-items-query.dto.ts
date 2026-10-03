import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const storeItemSortFields = ['createdAt', 'isActive', 'updatedAt'] as const;

export type StoreItemSortField = (typeof storeItemSortFields)[number];

export class ListStoreItemsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: storeItemSortFields })
  @IsIn(storeItemSortFields)
  @IsOptional()
  sortBy?: StoreItemSortField;
}
