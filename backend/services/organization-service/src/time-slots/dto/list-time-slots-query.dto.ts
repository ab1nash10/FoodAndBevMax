import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';
import { toOptionalBoolean } from '../../common/values';

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
