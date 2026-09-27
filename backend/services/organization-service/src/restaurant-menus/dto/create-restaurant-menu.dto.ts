import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export enum RestaurantMenuDayOfWeek {
  FRIDAY = 'FRIDAY',
  MONDAY = 'MONDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
  THURSDAY = 'THURSDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
}

export enum RestaurantMenuPositionType {
  AFTER_ITEM = 'AFTER_ITEM',
  BEFORE_ITEM = 'BEFORE_ITEM',
  FIRST = 'FIRST',
  LAST = 'LAST',
}

export class CreateRestaurantMenuDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  restaurantId!: string;

  @ApiProperty({ example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({
    example: ['f54db87f-0255-4326-a579-d6dc7ce78228'],
    isArray: true,
    type: String,
  })
  @ArrayUnique()
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  timeSlotIds?: string[];

  @ApiPropertyOptional({
    enum: RestaurantMenuDayOfWeek,
    example: [RestaurantMenuDayOfWeek.MONDAY, RestaurantMenuDayOfWeek.TUESDAY],
    isArray: true,
  })
  @ArrayUnique()
  @IsArray()
  @IsEnum(RestaurantMenuDayOfWeek, { each: true })
  @IsOptional()
  daysOfWeek?: RestaurantMenuDayOfWeek[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: RestaurantMenuPositionType.LAST,
    enum: RestaurantMenuPositionType,
  })
  @IsEnum(RestaurantMenuPositionType)
  @IsOptional()
  positionType?: RestaurantMenuPositionType;

  @ApiPropertyOptional({
    description: 'Required when positionType is BEFORE_ITEM or AFTER_ITEM.',
    example: 'a4f14972-6f94-44df-b078-f4e182f0c8fb',
  })
  @IsUUID()
  @ValidateIf(
    (dto: CreateRestaurantMenuDto) =>
      dto.positionType === RestaurantMenuPositionType.BEFORE_ITEM ||
      dto.positionType === RestaurantMenuPositionType.AFTER_ITEM,
  )
  referenceMenuId?: string;
}
