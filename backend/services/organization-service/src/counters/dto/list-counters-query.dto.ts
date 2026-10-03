import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const counterSortFields = [
  'counterCode',
  'counterName',
  'createdAt',
  'isActive',
  'updatedAt',
] as const;

export type CounterSortField = (typeof counterSortFields)[number];

export class ListCountersQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional({ example: '0f7e08c8-66d9-4a50-994a-7e5c91565f9d' })
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiPropertyOptional({ enum: counterSortFields })
  @IsIn(counterSortFields)
  @IsOptional()
  sortBy?: CounterSortField;
}
