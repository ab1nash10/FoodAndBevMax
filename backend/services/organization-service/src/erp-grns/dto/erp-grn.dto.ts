import { GrnEntryStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

/** One batch the ERP sent: one row of grn_entries. */
export class ErpGrnBatchDto {
  @ApiProperty({
    description: "The ERP's own id for this batch row; never reused.",
    example: '724630',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  transactionNumber!: string;

  @ApiProperty({ example: 'B123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  batchNumber!: string;

  @ApiProperty({ example: '2027-10-26' })
  @IsDateString()
  expiryDate!: string;

  @ApiProperty({ description: 'Quantity sent, in the item’s unit.', example: 60 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qty!: number;

  @ApiPropertyOptional({ example: 693.84 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  totalValue?: number;
}

export class ErpGrnItemDto {
  @ApiProperty({ description: 'The AAHAR item code.', example: 'ITM0042' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  itemCode!: string;

  @ApiPropertyOptional({ example: 'Kinley Water - 1000 Ml' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  itemName?: string;

  @ApiPropertyOptional({ example: 'No.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  uom?: string;

  @ApiPropertyOptional({ example: '998313' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsnCode?: string;

  @ApiPropertyOptional({ example: 9.8 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  unitRate?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({ example: 'IGST@18%' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxRate?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [ErpGrnBatchDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ErpGrnBatchDto)
  batches!: ErpGrnBatchDto[];
}

/** One GRN from the ERP, with every item and every batch. */
export class ErpGrnDto {
  @ApiProperty({ example: '12344' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  grnNumber!: string;

  @ApiProperty({ description: '0 = goods in, 1 = return to vendor.', enum: [0, 1], example: 0 })
  @IsIn([0, 1])
  flag!: 0 | 1;

  @ApiProperty({ description: 'The AAHAR hospital (location) code.', example: 'BLK' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  hospitalCode!: string;

  @ApiProperty({ description: 'The AAHAR store code in that hospital.', example: 'MAIN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  storeCode!: string;

  @ApiProperty({ example: '2026-10-26T15:50:00+05:30' })
  @IsDateString()
  transactionDate!: string;

  @ApiPropertyOptional({ example: 'M030634' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  issuedBy?: string;

  @ApiPropertyOptional({ example: '392851' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  purchaseOrder?: string;

  @ApiPropertyOptional({ example: '918590' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requisitionNumber?: string;

  @ApiPropertyOptional({ example: 'CAGR0008' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vendorCode?: string;

  @ApiProperty({ type: [ErpGrnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ErpGrnItemDto)
  items!: ErpGrnItemDto[];
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
