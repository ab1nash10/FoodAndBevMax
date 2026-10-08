import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const itemCategorySortFields = [
  'categoryName',
  'createdAt',
  'isActive',
  'updatedAt',
] as const;

export type ItemCategorySortField = (typeof itemCategorySortFields)[number];

export class ListItemCategoriesQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional({ default: 'createdAt', enum: itemCategorySortFields })
  @IsIn(itemCategorySortFields)
  @IsOptional()
  sortBy?: ItemCategorySortField;

  @ApiPropertyOptional({ description: 'Categories shared by every location plus this location' })
  @IsOptional()
  @IsUUID()
  hospitalId?: string;
}
