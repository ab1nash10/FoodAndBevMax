import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateItemCategoryDto {
  @ApiProperty({
    description:
      'Duplicate checks ignore spaces, punctuation, symbols, underscores, hyphens, and case.',
    example: 'Beverages',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/[A-Za-z0-9]/, {
    message: 'Category name must include at least one letter or number',
  })
  @MaxLength(255)
  categoryName!: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
