import { GrnStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const grnSortFields = [
  'createdAt',
  'grnNumber',
  'receivedDate',
  'status',
  'updatedAt',
] as const;

export type GrnSortField = (typeof grnSortFields)[number];

export class ListGrnsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ enum: GrnStatus })
  @IsEnum(GrnStatus)
  @IsOptional()
  status?: GrnStatus;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: grnSortFields })
  @IsIn(grnSortFields)
  @IsOptional()
  sortBy?: GrnSortField;
}
