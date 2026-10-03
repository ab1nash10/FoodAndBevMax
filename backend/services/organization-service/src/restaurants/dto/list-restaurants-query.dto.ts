import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const restaurantSortFields = [
  'restaurantName',
  'restaurantCode',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;
export type RestaurantSortField = (typeof restaurantSortFields)[number];

export class ListRestaurantsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  kitchenId?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: restaurantSortFields })
  @IsIn(restaurantSortFields)
  @IsOptional()
  sortBy?: RestaurantSortField;
}
