import { InventoryLocationType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTransferLineDto {
  @ApiProperty({ example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ example: 'BATCH-A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiProperty({ example: 10, minimum: 0.001 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Type(() => Number)
  sentQty!: number;

  @ApiPropertyOptional({ example: 'Urgent cafeteria replenishment' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateTransferDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ enum: InventoryLocationType, example: InventoryLocationType.STORE })
  @IsEnum(InventoryLocationType)
  sourceType!: InventoryLocationType;

  @ApiProperty({ example: '64f7f566-eef9-46e1-a097-1344c0c745d6' })
  @IsUUID()
  sourceId!: string;

  @ApiProperty({ enum: InventoryLocationType, example: InventoryLocationType.RESTAURANT })
  @IsEnum(InventoryLocationType)
  destinationType!: InventoryLocationType;

  @ApiProperty({ example: 'e2fb612d-fd78-4ed9-bdc2-1ef7727574bd' })
  @IsUUID()
  destinationId!: string;

  @ApiProperty({ example: '2026-06-24T10:00:00.000Z' })
  @IsDateString()
  transferDate!: string;

  @ApiPropertyOptional({ example: '2026-06-24' })
  @IsDateString()
  @IsOptional()
  businessDate?: string;

  @ApiPropertyOptional({ example: 'Transfer to Main Cafeteria' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ isArray: true, type: CreateTransferLineDto })
  @ArrayMinSize(1)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTransferLineDto)
  items!: CreateTransferLineDto[];
}
