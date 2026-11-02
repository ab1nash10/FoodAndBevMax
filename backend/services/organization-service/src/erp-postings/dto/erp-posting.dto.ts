import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErpPostingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class SendErpPostingDto {
  @ApiProperty()
  @IsUUID()
  hospitalId!: string;

  @ApiProperty()
  @IsUUID()
  restaurantId!: string;

  @ApiProperty({ description: 'The business day, YYYY-MM-DD (India time); yesterday or earlier.' })
  @Matches(DAY, { message: 'businessDate must be a day, YYYY-MM-DD.' })
  businessDate!: string;

  @ApiPropertyOptional({ description: 'Send a day the ERP already took, again.' })
  @IsOptional()
  @IsBoolean()
  resend?: boolean;
}

export class ErpPostingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiPropertyOptional({ enum: ErpPostingStatus })
  @IsOptional()
  @IsEnum(ErpPostingStatus)
  status?: ErpPostingStatus;

  @ApiPropertyOptional({ description: 'Business days from, YYYY-MM-DD (included).' })
  @IsOptional()
  @Matches(DAY, { message: 'from must be a day, YYYY-MM-DD.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Business days to, YYYY-MM-DD (included).' })
  @IsOptional()
  @Matches(DAY, { message: 'to must be a day, YYYY-MM-DD.' })
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
