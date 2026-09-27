import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty()
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ example: 'Max Saket' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  locationName!: string;

  @ApiPropertyOptional({ example: 'Main Building' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  building?: string;

  @ApiPropertyOptional({ example: 'Ground Floor' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  floor?: string;

  @ApiPropertyOptional({ example: 'Cafeteria Zone' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ example: 'Saket, New Delhi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
