import {
  InventoryLocationType,
  ItemType,
  StockReferenceType,
  StockTransactionType,
} from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { toOptionalBoolean } from '../../common/values';

export const stockLedgerSortFields = ['businessDate', 'createdAt', 'transactionDateTime'] as const;

export type StockLedgerSortField = (typeof stockLedgerSortFields)[number];

export class ListStockLedgersQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ example: '2026-06-22' })
  @IsDateString()
  @IsOptional()
  businessDate?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ enum: StockTransactionType })
  @IsEnum(StockTransactionType)
  @IsOptional()
  transactionType?: StockTransactionType;

  @ApiPropertyOptional({ enum: StockReferenceType })
  @IsEnum(StockReferenceType)
  @IsOptional()
  referenceType?: StockReferenceType;

  @ApiPropertyOptional({
    description:
      'true adds meta.referenceTypeCounts: the count per reference type under the other filters, for the tabs.',
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  referenceTypeCounts?: boolean;

  @ApiPropertyOptional({ default: 'transactionDateTime', enum: stockLedgerSortFields })
  @IsIn(stockLedgerSortFields)
  @IsOptional()
  sortBy?: StockLedgerSortField;
}
