import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

export class DashboardSetupQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;
}

export class DashboardServiceQueryDto extends DashboardSetupQueryDto {
  /** The business day (India time); today when left out. */
  @ApiPropertyOptional({ example: '2026-11-22' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  /** Compared with the same day last week (week, the default) or the day before (day). */
  @ApiPropertyOptional({ default: 'week', enum: ['day', 'week'] })
  @IsOptional()
  @IsIn(['day', 'week'])
  compare?: 'day' | 'week';
}

export class DashboardRecordsQueryDto extends DashboardSetupQueryDto {
  /** Start of the period before the one shown, so the dashboard can show deltas. */
  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  fromDate!: string;
}
