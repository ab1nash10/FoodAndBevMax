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
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateKitchenProductionLineDto {
  @ApiProperty({ example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ example: 100, minimum: 0.001 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Type(() => Number)
  producedQty!: number;

  @ApiPropertyOptional({ default: 0, example: 5, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  wastageQty?: number;

  @ApiPropertyOptional({ example: 95, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  acceptedQty?: number;

  @ApiPropertyOptional({ example: 'Morning batch' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateKitchenProductionDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ example: '64f7f566-eef9-46e1-a097-1344c0c745d6' })
  @IsUUID()
  kitchenId!: string;

  @ApiProperty({ example: '2026-06-24T07:00:00.000Z' })
  @IsDateString()
  productionDate!: string;

  @ApiProperty({ example: '2026-06-24' })
  @IsDateString()
  businessDate!: string;

  @ApiPropertyOptional({ example: '1bbf4776-9ead-442f-a43b-95db196a4540' })
  @IsOptional()
  @IsUUID()
  chefUserId?: string;

  @ApiPropertyOptional({ example: 'Breakfast production' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ isArray: true, type: CreateKitchenProductionLineDto })
  @ArrayMinSize(1)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateKitchenProductionLineDto)
  items!: CreateKitchenProductionLineDto[];
}
