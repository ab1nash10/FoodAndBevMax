import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OpenShiftDto {
  @ApiProperty()
  @IsUUID()
  counterId!: string;

  @ApiProperty({ description: 'Cash in the till when the shift starts.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  openingCash!: number;
}

export class EndShiftDto {
  @ApiProperty({ description: 'Cash counted in the till.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  countedCash!: number;

  @ApiProperty({ description: 'True hands the cash and stock over to the next cashier.' })
  @IsBoolean()
  handover!: boolean;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  note?: string;
}

export class CloseDayDto {
  @ApiProperty()
  @IsUUID()
  counterId!: string;

  @ApiPropertyOptional({ description: 'Business date (YYYY-MM-DD); today when omitted.' })
  @IsDateString()
  @IsOptional()
  date?: string;
}
