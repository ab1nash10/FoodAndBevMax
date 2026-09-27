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

export class CreateTransferAcknowledgementLineDto {
  @ApiProperty({ example: 'b9e16d28-5c46-4d93-8365-e06ea6b58c6e' })
  @IsUUID()
  transferLineId!: string;

  @ApiPropertyOptional({ example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ example: 'BATCH-A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional({ example: 20, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  sentQty?: number;

  @ApiProperty({ example: 18, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  acceptedQty!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  rejectedQty!: number;

  @ApiPropertyOptional({ example: 'Damaged during transfer' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ example: 'Two bottles damaged' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateTransferAcknowledgementDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  transferId!: string;

  @ApiPropertyOptional({ example: 'Received with two rejected items' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ isArray: true, type: CreateTransferAcknowledgementLineDto })
  @ArrayMinSize(1)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTransferAcknowledgementLineDto)
  items!: CreateTransferAcknowledgementLineDto[];
}
