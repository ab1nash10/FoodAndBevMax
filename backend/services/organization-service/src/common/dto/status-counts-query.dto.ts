import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { toOptionalBoolean } from '../values';
import { PaginationQueryDto } from './pagination-query.dto';

/** A list whose screen has status tabs: it can count every tab in the same request. */
export class StatusCountsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'true adds meta.statusCounts: the count per status under the other filters (status itself ignored), from one grouped query instead of one request per tab.',
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  statusCounts?: boolean;
}
