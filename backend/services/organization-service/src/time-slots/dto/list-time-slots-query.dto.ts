import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

export const timeSlotSortFields = [
  'createdAt',
  'endTime',
  'isActive',
  'isAlwaysAvailable',
  'slotName',
  'startTime',
  'updatedAt',
] as const;

export type TimeSlotSortField = (typeof timeSlotSortFields)[number];

function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}

export class ListTimeSlotsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  isAlwaysAvailable?: boolean;

  @ApiPropertyOptional({ default: 'createdAt', enum: timeSlotSortFields })
  @IsIn(timeSlotSortFields)
  @IsOptional()
  sortBy?: TimeSlotSortField;
}
