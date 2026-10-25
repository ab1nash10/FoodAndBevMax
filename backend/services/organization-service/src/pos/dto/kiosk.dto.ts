import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const mobilePattern = /^[6-9]\d{9}$/;
const mobileMessage = 'mobile must be a 10-digit Indian mobile number';

export class KioskStaffQueryDto {
  @ApiProperty({ example: '9876543210' })
  @Matches(mobilePattern, { message: mobileMessage })
  mobile!: string;

  @ApiPropertyOptional({ description: "The restaurant's board link secret." })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  token?: string;
}

export class KioskOrderLineDto {
  @ApiProperty({ description: 'The restaurant menu item.' })
  @IsUUID()
  menuId!: string;

  @ApiProperty({ maximum: 20, minimum: 1 })
  @IsInt()
  @Max(20)
  @Min(1)
  quantity!: number;
}

export class CreateKioskOrderDto {
  @ApiProperty({
    description: "The kiosk's own id for this order: sending it again returns the same order.",
  })
  @IsString()
  @MaxLength(64)
  clientOrderId!: string;

  @ApiProperty({ type: [KioskOrderLineDto] })
  @ArrayMaxSize(30)
  @ArrayMinSize(1)
  @Type(() => KioskOrderLineDto)
  @ValidateNested({ each: true })
  lines!: KioskOrderLineDto[];

  @ApiPropertyOptional({
    description: "A staff member's registered mobile, for their staff discount.",
    example: '9876543210',
  })
  @IsOptional()
  @Matches(mobilePattern, { message: mobileMessage })
  mobile?: string;
}

export class KioskOrderLookupQueryDto {
  @ApiProperty()
  @IsUUID()
  counterId!: string;
}
