import { ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';
import { RestaurantMenuDayOfWeek } from './create-restaurant-menu.dto';

export const restaurantMenuSortFields = [
  'createdAt',
  'displayOrder',
  'isActive',
  'isAvailable',
  'updatedAt',
] as const;

export type RestaurantMenuSortField = (typeof restaurantMenuSortFields)[number];

function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}

export class ListRestaurantMenusQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  timeSlotId?: string;

  @ApiPropertyOptional({ enum: RestaurantMenuDayOfWeek })
  @IsEnum(RestaurantMenuDayOfWeek)
  @IsOptional()
  dayOfWeek?: RestaurantMenuDayOfWeek;

  @ApiPropertyOptional({ type: Boolean })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  isAvailable?: boolean;

  @ApiPropertyOptional({ default: 'displayOrder', enum: restaurantMenuSortFields })
  @IsIn(restaurantMenuSortFields)
  @IsOptional()
  sortBy?: RestaurantMenuSortField;
}
