import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Table name, e.g. grns, transfers, items.' })
  @IsOptional()
  @Matches(/^[a-z_]{1,64}$/, { message: 'entityName must be a table name.' })
  entityName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'An event catalogue action, e.g. GRN_POST.' })
  @IsOptional()
  @Matches(/^[A-Z_]{1,64}$/, { message: 'action must be a catalogue action.' })
  action?: string;

  @ApiPropertyOptional({ description: 'Who made the change.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Only this location; otherwise every location you may see.' })
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional({ description: 'From, an ISO date-time (included).' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'To, an ISO date-time (not included).' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Words in the summary.' })
  @IsOptional()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'nextCursor of the previous page.' })
  @IsOptional()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Max(200)
  @Min(1)
  @Type(() => Number)
  limit?: number = 50;
}
