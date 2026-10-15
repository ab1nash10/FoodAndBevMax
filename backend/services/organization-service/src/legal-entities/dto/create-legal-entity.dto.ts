import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLegalEntityDto {
  @ApiProperty({ description: 'The site the entity bills for', example: 'MSSH SKT' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  locationName!: string;

  @ApiProperty({ example: 'MAX HEALTHCARE INSTITUTE LIMITED' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  entityName!: string;

  @ApiProperty({ example: 'N 110, Panchsheel Park, New Delhi- 110017' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  entityAddress!: string;

  @ApiProperty({
    description: 'The 15-character GSTIN; spaces are ignored and letters are stored in capitals.',
    example: '07AADCM0815B1ZQ',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  gstNumber!: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
