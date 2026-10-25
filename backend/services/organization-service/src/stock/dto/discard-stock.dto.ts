import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const discardReasons = ['EXPIRED', 'DAMAGED', 'SPOILT', 'SPILLED', 'OTHER'] as const;

export type DiscardReason = (typeof discardReasons)[number];

/** Throws part (or all) of one batch away at the location that holds it. */
export class DiscardStockDto {
  @ApiProperty({ description: 'The stock balance (one batch at one location).' })
  @IsUUID()
  stockBalanceId!: string;

  @ApiProperty({ example: 2.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;

  @ApiProperty({ enum: discardReasons })
  @IsIn(discardReasons)
  reason!: DiscardReason;

  @ApiPropertyOptional({ description: 'Required for OTHER; optional otherwise.', maxLength: 200 })
  @ValidateIf((body: DiscardStockDto) => body.reason === 'OTHER' || body.note !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Say what happened to the stock.' })
  @MaxLength(200)
  note?: string;
}
