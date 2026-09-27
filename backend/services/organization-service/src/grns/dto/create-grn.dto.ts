import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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

  @ApiProperty({ example: 40, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
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

  @ApiPropertyOptional({ example: 'Damaged packaging' })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ example: 'Expired batch' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ example: 'Partial receiving' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ isArray: true, type: CreateGrnBatchDto })
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
  @MaxLength(255)
  receivedBy!: string;

  @ApiPropertyOptional({ example: 'ABC Beverages' })
  @IsOptional()
  @IsString()
  vendorName?: string;

  @ApiPropertyOptional({ example: 'PO-2026-0001' })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({ example: 'INV-2026-0001' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: 'Received beverage stock' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ isArray: true, type: CreateGrnLineDto })
  @ArrayMinSize(1)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGrnLineDto)
  items!: CreateGrnLineDto[];
}
