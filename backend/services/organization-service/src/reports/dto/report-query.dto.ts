import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

export class ReportQueryDto {
  @ApiProperty({ description: 'The location the report is for.' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ description: 'Start, an ISO date-time (included).' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'End, an ISO date-time (not included).' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ description: 'Comma-separated restaurant ids; all when omitted.' })
  @IsOptional()
  @Matches(/^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/i, { message: 'restaurantIds must be ids.' })
  restaurantIds?: string;
}
