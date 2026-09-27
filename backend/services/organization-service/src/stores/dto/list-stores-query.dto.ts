import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const storeSortFields = [
  'storeName',
  'storeCode',
  'storeType',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;
export type StoreSortField = (typeof storeSortFields)[number];

export class ListStoresQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  storeType?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: storeSortFields })
  @IsIn(storeSortFields)
  @IsOptional()
  sortBy?: StoreSortField;
}
