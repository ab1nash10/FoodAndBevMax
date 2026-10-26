import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const sortOrders = ['asc', 'desc'] as const;
export type SortOrder = (typeof sortOrders)[number];

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    description: '0 returns only meta.total: one count, no rows or their related records.',
    maximum: 100,
    minimum: 0,
  })
  @IsInt()
  @IsOptional()
  @Max(100)
  @Min(0)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 'desc', enum: sortOrders })
  @IsIn(sortOrders)
  @IsOptional()
  // No initialiser: each list's own default (getOrderBy) applies when it is left out.
  sortOrder?: SortOrder;
}
