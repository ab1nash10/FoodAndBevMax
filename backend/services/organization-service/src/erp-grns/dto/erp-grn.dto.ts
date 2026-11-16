import { GrnEntryStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
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
 * is every row with its grn_No; the GRN-wide fields repeat on each row.
 */
export class ErpGrnRowDto {
  @ApiProperty({ description: "The ERP's own id for this row; never reused.", example: '724630' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  transaction_number!: string;

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

  @ApiPropertyOptional({
    description: 'Left out, the Item master name is used.',
    example: 'Kinley Water - 1000 Ml',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  item_name?: string;

  @ApiProperty({ description: 'Quantity sent, in the item’s unit.', example: '5' })
  @AsNumber()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  transaction_qty!: number;

  @ApiPropertyOptional({ example: 'No.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  UOM?: string;

  @ApiPropertyOptional({
    description: 'Left out, the Item master HSN code is used.',
    example: '998313',
  })
  @AsText()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  'HSN No'?: string;

  @ApiProperty({
    description: 'When the goods moved. With no time zone it is India time.',
    example: '2026-10-26 15:50:00',
  })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: '9.80' })
  @AsNumber()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  'Unit Rate'?: number;

  @ApiPropertyOptional({ example: '15' })
  @AsNumber()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  MRP?: number;

  @ApiPropertyOptional({ example: 'IGST@18%' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  'Tax Rate'?: string;

  @ApiPropertyOptional({ example: '0' })
  @AsNumber()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  'Discount/Extra Charges'?: number;

  @ApiPropertyOptional({ example: '9.257' })
  @AsNumber()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  'Total Value'?: number;

  @ApiPropertyOptional({ example: 'M030634' })
  @AsText()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  issued_by?: string;

  @ApiPropertyOptional({ example: '392851' })
  @AsText()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  purchase_order?: string;

  @ApiPropertyOptional({ example: '918590' })
  @AsText()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requisition?: string;

  @ApiProperty({ example: '12344' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  grn_No!: string;

  @ApiPropertyOptional({ description: 'The vendor code.', example: 'CAGR0008' })
  @AsText()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplier?: string;

  @ApiProperty({ example: '*' })
  @AsText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  batch!: string;

  @ApiProperty({ example: '2027-10-26 15:50:00' })
  @IsDateString()
  expiry_date!: string;

  @ApiPropertyOptional({
    description: '0 = goods in (the default), 1 = return to vendor.',
    enum: [0, 1],
    example: 0,
  })
  @AsNumber()
  @IsOptional()
  @IsIn([0, 1])
  flag?: 0 | 1;
}

export class VerifyGrnEntryBatchDto {
  @ApiProperty({ example: '724630' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  transactionNumber!: string;

  @ApiProperty({ example: 30 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  acceptedQty!: number;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  rejectedQty!: number;

  @ApiPropertyOptional({ example: 'Damaged packing' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}

/** The store's answer for every batch of a GRN. */
export class VerifyGrnEntryDto {
  @ApiProperty({ type: [VerifyGrnEntryBatchDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => VerifyGrnEntryBatchDto)
  batches!: VerifyGrnEntryBatchDto[];
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
}
