import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const locationSortFields = [
  'locationName',
  'building',
  'floor',
  'area',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;
export type LocationSortField = (typeof locationSortFields)[number];

export class ListLocationsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  building?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: locationSortFields })
  @IsIn(locationSortFields)
  @IsOptional()
  sortBy?: LocationSortField;
}
