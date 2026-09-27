import { TransferAcknowledgementStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const transferAcknowledgementSortFields = [
  'acknowledgementDate',
  'createdAt',
  'status',
  'updatedAt',
] as const;

export type TransferAcknowledgementSortField = (typeof transferAcknowledgementSortFields)[number];

export class ListTransferAcknowledgementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  transferId?: string;

  @ApiPropertyOptional({ enum: TransferAcknowledgementStatus })
  @IsEnum(TransferAcknowledgementStatus)
  @IsOptional()
  status?: TransferAcknowledgementStatus;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: transferAcknowledgementSortFields })
  @IsIn(transferAcknowledgementSortFields)
  @IsOptional()
  sortBy?: TransferAcknowledgementSortField;
}
