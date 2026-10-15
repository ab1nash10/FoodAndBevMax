import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const legalEntitySortFields = [
  'createdAt',
  'entityName',
  'gstNumber',
  'isActive',
  'locationName',
  'updatedAt',
] as const;

export type LegalEntitySortField = (typeof legalEntitySortFields)[number];

export class ListLegalEntitiesQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional({ default: 'createdAt', enum: legalEntitySortFields })
  @IsIn(legalEntitySortFields)
  @IsOptional()
  sortBy?: LegalEntitySortField;
}
