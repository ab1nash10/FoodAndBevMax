import { InventoryLocationType, TransferStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const transferSortFields = [
  'createdAt',
  'transferDate',
  'transferNumber',
  'status',
  'updatedAt',
] as const;

export type TransferSortField = (typeof transferSortFields)[number];

export class ListTransfersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional({ enum: InventoryLocationType })
  @IsEnum(InventoryLocationType)
  @IsOptional()
  sourceType?: InventoryLocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({ enum: InventoryLocationType })
  @IsEnum(InventoryLocationType)
  @IsOptional()
  destinationType?: InventoryLocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @ApiPropertyOptional({ enum: TransferStatus })
  @IsEnum(TransferStatus)
  @IsOptional()
  status?: TransferStatus;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: transferSortFields })
  @IsIn(transferSortFields)
  @IsOptional()
  sortBy?: TransferSortField;
}
