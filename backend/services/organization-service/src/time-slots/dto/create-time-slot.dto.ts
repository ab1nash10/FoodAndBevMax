import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTimeSlotDto {
  @ApiProperty({ example: 'Breakfast' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  slotName!: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsNotEmpty()
  @IsString()
  @Matches(timePattern, { message: 'startTime must use HH:mm format' })
  @ValidateIf((body: CreateTimeSlotDto) => !body.isAlwaysAvailable)
  startTime?: string;

  @ApiPropertyOptional({ example: '10:30' })
  @IsNotEmpty()
  @IsString()
  @Matches(timePattern, { message: 'endTime must use HH:mm format' })
  @ValidateIf((body: CreateTimeSlotDto) => !body.isAlwaysAvailable)
  endTime?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isAlwaysAvailable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
