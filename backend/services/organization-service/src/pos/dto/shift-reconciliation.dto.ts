import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const RECONCILIATION_STATUSES = [
  'NEEDS_REASON',
  'WAITING',
  'SENT_BACK',
  'APPROVED',
] as const;

export class ListShiftReconciliationsDto {
  @ApiPropertyOptional({
    description: 'The site day the shifts opened on (YYYY-MM-DD); today when omitted.',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  restaurantId?: string;

  @ApiPropertyOptional({ enum: RECONCILIATION_STATUSES })
  @IsIn(RECONCILIATION_STATUSES)
  @IsOptional()
  status?: (typeof RECONCILIATION_STATUSES)[number];
}

export class ShiftReasonDto {
  @ApiProperty({ description: 'One of the reasons listed for the difference.', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  reason!: string;

  @ApiPropertyOptional({
    description: 'What happened; needed when the reason is Other.',
    maxLength: 300,
  })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  @Transform(trim)
  note?: string;
}

/** A reason per difference: cash, UPI and card. */
export class ShiftReasonsDto {
  @ApiPropertyOptional({ type: ShiftReasonDto })
  @ValidateNested()
  @Type(() => ShiftReasonDto)
  @IsOptional()
  CASH?: ShiftReasonDto;

  @ApiPropertyOptional({ type: ShiftReasonDto })
  @ValidateNested()
  @Type(() => ShiftReasonDto)
  @IsOptional()
  UPI?: ShiftReasonDto;

  @ApiPropertyOptional({ type: ShiftReasonDto })
  @ValidateNested()
  @Type(() => ShiftReasonDto)
  @IsOptional()
  CARD?: ShiftReasonDto;
}

export class SaveShiftReasonsDto {
  @ApiProperty({ type: ShiftReasonsDto })
  @ValidateNested()
  @Type(() => ShiftReasonsDto)
  reasons!: ShiftReasonsDto;
}

export class ApproveShiftDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  @Transform(trim)
  comment?: string;
}

export class SendBackShiftDto {
  @ApiProperty({ description: 'What the restaurant admin should fix.', maxLength: 300 })
  @IsString()
  @IsNotEmpty({ message: 'Say what should be fixed.' })
  @MaxLength(300)
  @Transform(trim)
  comment!: string;
}
