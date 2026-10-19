import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FoodType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateItemDto {
  @ApiProperty({
    description:
      'Unique within its category. Duplicate checks ignore spaces, punctuation, symbols, underscores, hyphens, and case.',
    example: 'Coke 500ml',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/[A-Za-z0-9]/, {
    message: 'Item name must include at least one letter or number',
  })
  @MaxLength(255)
  itemName!: string;

  @ApiProperty({ enum: FoodType, example: FoodType.VEG })
  @IsEnum(FoodType)
  type!: FoodType;

  @ApiPropertyOptional({ example: 15, minimum: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  preparationTimeMinutes?: number;

  @ApiPropertyOptional({ example: '2202' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  hsnCode?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
