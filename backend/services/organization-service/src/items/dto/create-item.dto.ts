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
import { CodeCase, DisplayName } from '../../common/display-name.decorator';

export class CreateItemDto {
  @ApiProperty({
    description:
      'Unique across all items. Duplicate checks ignore spaces, punctuation, symbols, underscores, hyphens, and case.',
    example: 'Coke 500ml',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/[A-Za-z0-9]/, {
    message: 'Item name must include at least one letter or number',
  })
  @MaxLength(255)
  @DisplayName()
  itemName!: string;

  @ApiProperty({ enum: FoodType, example: FoodType.VEG })
  @IsEnum(FoodType)
  type!: FoodType;

  @ApiPropertyOptional({ example: 15, minimum: 0, nullable: true })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  preparationTimeMinutes?: number | null;

  @ApiPropertyOptional({ example: '2202', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @CodeCase()
  hsnCode?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
