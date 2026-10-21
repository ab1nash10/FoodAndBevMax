import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DisplayName } from '../../common/display-name.decorator';

export class CreateGrnBatchDto {
  @ApiProperty({ example: 'BATCH-A' })
  @IsString()
  @MaxLength(100)
  batchNumber!: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  manufacturingDate?: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  expiryDate!: string;

  @ApiProperty({ example: 40, minimum: 0.001 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'receivedQty must be greater than zero' })
  @Type(() => Number)
  receivedQty!: number;

  @ApiProperty({ example: 38, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  acceptedQty!: number;

  @ApiProperty({ default: 0, example: 2, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  rejectedQty!: number;

  @ApiPropertyOptional({
    description: 'Required when rejectedQty > 0, unless the line gives one.',
    example: 'Damaged packaging',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}

export class CreateGrnLineDto {
  @ApiProperty({ example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ example: 100, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  orderedQty?: number;

  @ApiProperty({ example: 80, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  receivedQty!: number;

  @ApiProperty({ example: 70, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  acceptedQty!: number;

  @ApiProperty({ default: 0, example: 10, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  rejectedQty!: number;

  @ApiPropertyOptional({
    description: 'Used for any rejected batch that gives no reason of its own.',
    example: 'Expired batch',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;

  @ApiPropertyOptional({ example: 'Partial receiving' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @ApiProperty({ isArray: true, type: CreateGrnBatchDto })
  @ArrayMaxSize(200)
  @ArrayMinSize(1)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGrnBatchDto)
  batches!: CreateGrnBatchDto[];
}

export class CreateGrnDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ example: '64f7f566-eef9-46e1-a097-1344c0c745d6' })
  @IsUUID()
  storeId!: string;

  @ApiProperty({ example: '2026-06-22T10:00:00.000Z' })
  @IsDateString()
  receivedDate!: string;

  @ApiProperty({ example: 'Store Receiver' })
  @IsString()
  @Matches(/\S/, { message: 'receivedBy is required' })
  @MaxLength(255)
  receivedBy!: string;

  // Required: the vendor-wise GRN report groups by it, and a goods receipt names its supplier.
  @ApiProperty({ example: 'ABC Beverages' })
  @IsNotEmpty({ message: 'vendorName is required' })
  @IsString()
  @MaxLength(500)
  @DisplayName()
  vendorName!: string;

  @ApiPropertyOptional({ example: 'PO-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  poNumber?: string;

  @ApiPropertyOptional({ example: 'INV-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: 'Received beverage stock' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @ApiProperty({ isArray: true, type: CreateGrnLineDto })
  @ArrayMaxSize(200)
  @ArrayMinSize(1)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGrnLineDto)
  items!: CreateGrnLineDto[];
}
