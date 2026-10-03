import { KitchenProductionStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const kitchenProductionSortFields = [
  'businessDate',
  'createdAt',
  'productionDate',
  'productionNumber',
  'status',
  'updatedAt',
] as const;

export type KitchenProductionSortField = (typeof kitchenProductionSortFields)[number];

export class ListKitchenProductionsQueryDto extends PaginationQueryDto {
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
  chefUserId?: string;

  @ApiPropertyOptional({ enum: KitchenProductionStatus })
  @IsEnum(KitchenProductionStatus)
  @IsOptional()
  status?: KitchenProductionStatus;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: kitchenProductionSortFields })
  @IsIn(kitchenProductionSortFields)
  @IsOptional()
  sortBy?: KitchenProductionSortField;
}
