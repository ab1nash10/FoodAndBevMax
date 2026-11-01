import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsPositive, IsUUID, ValidateBy, ValidateIf } from 'class-validator';

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
  // One rule with one message: separate IsString/IsNotEmpty/MaxLength all fired on a missing
  // note and joined their three messages into one error.
  @ValidateBy({
    name: 'discardNote',
    validator: {
      defaultMessage: (args) =>
        typeof args?.value === 'string' && args.value.length > 200
          ? 'Keep the note to 200 characters or fewer.'
          : 'Say what happened to the stock.',
      validate: (value: unknown) =>
        typeof value === 'string' && value.trim().length > 0 && value.length <= 200,
    },
  })
  note?: string;
}
