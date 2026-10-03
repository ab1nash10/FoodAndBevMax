import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const kitchenSortFields = [
  'kitchenName',
  'kitchenCode',
  'openingTime',
  'closingTime',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;
export type KitchenSortField = (typeof kitchenSortFields)[number];

export class ListKitchensQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: kitchenSortFields })
  @IsIn(kitchenSortFields)
  @IsOptional()
  sortBy?: KitchenSortField;
}
