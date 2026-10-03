import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCounterDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  hospitalId!: string;

  @ApiProperty({ example: '0f7e08c8-66d9-4a50-994a-7e5c91565f9d' })
  @IsUUID()
  restaurantId!: string;

  @ApiProperty({ example: 'CAF-COUNTER-01' })
  @IsString()
  @MaxLength(50)
  counterCode!: string;

  @ApiProperty({ example: 'Main Cafeteria Counter' })
  @IsString()
  @MaxLength(150)
  counterName!: string;

  @ApiPropertyOptional({ example: 'POS-MAX-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  posDeviceId?: string;

  @ApiPropertyOptional({ example: 'PAY-MAX-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentDeviceId?: string;

  @ApiPropertyOptional({ example: 'PL-MAX-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pineLabsDeviceId?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
