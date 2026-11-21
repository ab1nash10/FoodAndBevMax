import { GrnEntryStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** The ERP writes numbers as text ("9.80"): a numeric string counts as the number. */
const AsNumber = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : value,
  );

/** And a code may come as a number (12344): it counts as the text. */
const AsText = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value));

/**
 * One row the ERP sends: one batch of one item of a GRN, in the ERP's own field names. A GRN
 * is every row with its grn_No; the GRN-wide fields repeat on each row. There is no transaction
 * number: AAHAR gives each request its own and returns it in the response.
 */
export class ErpGrnRowDto {
  @ApiProperty({
    description: 'The AAHAR location: its code, or its name. The GRN goes to its Main Store.',
    example: 'BLK',
  })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;

  @ApiProperty({ description: 'The AAHAR item code.', example: 'FNB01921' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  part_item_code!: string;

  @ApiProperty({ example: 'Kinley Water - 1000 Ml' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  item_name!: string;

  @ApiProperty({ description: 'Quantity sent, in the item’s unit.', example: '5' })
  @AsNumber()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  transaction_qty!: number;

  @ApiProperty({ example: 'No.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  UOM!: string;

  @ApiProperty({ example: '998313' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  'HSN No'!: string;

  @ApiProperty({
    description: 'When the goods moved. With no time zone it is India time.',
    example: '2026-10-26 15:50:00',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '9.80' })
  @AsNumber()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  'Unit Rate'!: number;

  @ApiProperty({ example: '15' })
  @AsNumber()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  MRP!: number;

  @ApiProperty({ example: 'IGST@18%' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  'Tax Rate'!: string;

  @ApiProperty({ example: '0' })
  @AsNumber()
  @IsNumber({ maxDecimalPlaces: 2 })
  'Discount/Extra Charges'!: number;

  @ApiProperty({ example: '9.257' })
  @AsNumber()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  'Total Value'!: number;

  @ApiProperty({ example: 'M030634' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  issued_by!: string;

  @ApiProperty({ example: '392851' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  purchase_order!: string;

  @ApiProperty({ example: '918590' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requisition!: string;

  @ApiProperty({
    description: 'The ERP’s GRN number. Sent again, its rows are added to that GRN.',
    example: '12344',
  })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  grn_No!: string;

  @ApiProperty({ description: 'The vendor code.', example: 'CAGR0008' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  supplier!: string;

  @ApiProperty({ example: '*' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  batch!: string;

  @ApiProperty({ example: '2027-10-26 15:50:00' })
  @IsDateString()
  expiry_date!: string;

  @ApiProperty({
    description:
      '0 = goods in (adds to the store), 1 = return to vendor (takes what the Main Store holds of ' +
      'the batch; the rest is owed until the batch comes back).',
    enum: [0, 1],
    example: 0,
  })
  @AsNumber()
  @IsIn([0, 1])
  flag!: 0 | 1;
}

/** Pauses (false) or resumes (true) a waiting reverse's automatic rerun. */
export class SetGrnEntryRerunDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  active!: boolean;
}

/** Why a waiting reverse is closed: what became of the stock still owed to the vendor. */
export const CLOSE_REASONS = {
  COUNT_MISMATCH: 'Stock count was wrong',
  ERP_ERROR: 'ERP entry was wrong',
  OTHER: 'Other',
  SOLD: 'Sold or used',
  WASTED: 'Wasted or damaged',
} as const;

export type CloseReason = keyof typeof CLOSE_REASONS;

/** Closes a waiting reverse; the service asks for the reason in plain words if it is missing. */
export class CloseGrnEntryDto {
  @ApiPropertyOptional({ enum: Object.keys(CLOSE_REASONS), example: 'SOLD' })
  @IsOptional()
  @IsIn(Object.keys(CLOSE_REASONS))
  reason?: CloseReason;

  @ApiPropertyOptional({
    description: 'More about it; needed for OTHER.',
    example: 'Sold at the café before the return came',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** The ERP asks how much of a batch a location's Main Store holds, before it sends a return. */
export class ErpStockQueryDto {
  @ApiProperty({ description: 'The AAHAR location code (or name).', example: '21' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  location!: string;

  @ApiProperty({ example: 'ITM0004' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  part_item_code!: string;

  @ApiProperty({ example: 'B-201' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  batch!: string;
}

/** A page of GRNs (not rows). `search` matches the GRN number. */
export class ListGrnEntriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GrnEntryStatus })
  @IsEnum(GrnEntryStatus)
  @IsOptional()
  status?: GrnEntryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Only GRNs verified at or after this time (ISO 8601).',
    example: '2026-10-28T11:00:00+05:30',
  })
  @IsDateString()
  @IsOptional()
  verifiedSince?: string;

  @ApiPropertyOptional({
    description: 'Received on or after this day (India).',
    example: '2026-11-01',
  })
  @IsDateString()
  @IsOptional()
  receivedFrom?: string;

  @ApiPropertyOptional({
    description: 'Received on or before this day (India).',
    example: '2026-11-30',
  })
  @IsDateString()
  @IsOptional()
  receivedTo?: string;
}

/** A page of refused GRNs (ERP GRN errors), newest first. `search` matches the GRN number. */
export class ListGrnRefusalsQueryDto extends OmitType(ListGrnEntriesQueryDto, [
  'status',
  'storeId',
  'verifiedSince',
] as const) {}
