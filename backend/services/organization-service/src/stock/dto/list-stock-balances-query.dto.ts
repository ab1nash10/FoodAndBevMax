import { InventoryLocationType, ItemType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const stockBalanceStatuses = [
  'AVAILABLE',
  'NEAR_EXPIRY',
  'EXPIRED',
  'LOW_STOCK',
  'OUT_OF_STOCK',
] as const;
export const stockBalanceSortFields = ['availableQty', 'expiryDate', 'lastUpdatedOn'] as const;

export type StockBalanceSortField = (typeof stockBalanceSortFields)[number];
export type StockBalanceStatus = (typeof stockBalanceStatuses)[number];

export class ListStockBalancesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional({ enum: InventoryLocationType })
  @IsEnum(InventoryLocationType)
  @IsOptional()
  locationType?: InventoryLocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

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
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional({ example: '2026-06-24' })
  @IsDateString()
  @IsOptional()
  businessDate?: string;

  @ApiPropertyOptional({ enum: stockBalanceStatuses })
  @IsIn(stockBalanceStatuses)
  @IsOptional()
  status?: StockBalanceStatus;

  @ApiPropertyOptional({ default: 'lastUpdatedOn', enum: stockBalanceSortFields })
  @IsIn(stockBalanceSortFields)
  @IsOptional()
  sortBy?: StockBalanceSortField;
}
