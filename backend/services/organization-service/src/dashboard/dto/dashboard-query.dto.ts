import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class DashboardSetupQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;
}

export class DashboardRecordsQueryDto extends DashboardSetupQueryDto {
  /** Start of the period before the one shown, so the dashboard can show deltas. */
  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  fromDate!: string;
}
