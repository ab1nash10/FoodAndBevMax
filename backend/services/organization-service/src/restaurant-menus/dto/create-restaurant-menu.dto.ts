import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuServeAt } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const menuGstSlabs = [0, 5, 12, 18];

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    description: 'On sale from, HH:mm. Leave both times empty for all day.',
    example: '07:00',
    nullable: true,
  })
  @IsOptional()
  @Matches(timePattern, { message: 'availableFrom must use HH:mm format' })
  availableFrom?: string | null;

  @ApiPropertyOptional({
    description: 'On sale until, HH:mm. Earlier than availableFrom runs past midnight.',
    example: '10:30',
    nullable: true,
  })
  @IsOptional()
  @Matches(timePattern, { message: 'availableTo must use HH:mm format' })
  availableTo?: string | null;

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
  @ApiPropertyOptional({
    description: "An active kitchen at the restaurant's location.",
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  kitchenId?: string | null;

  @ApiPropertyOptional({ example: 'Extra butter', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addOn?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isDiscountable?: boolean;

  @ApiPropertyOptional({ example: 15, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  preparationTimeMinutes?: number | null;

  @ApiPropertyOptional({ description: 'Number of people it serves.', example: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  serves?: number | null;

  @ApiPropertyOptional({ example: 'Pickle, curd', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accompaniments?: string | null;

  @ApiPropertyOptional({ default: 0, enum: menuGstSlabs })
  @IsIn(menuGstSlabs)
  @IsOptional()
  @Type(() => Number)
  gstPercent?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isGstInclusive?: boolean;

  @ApiPropertyOptional({ default: MenuServeAt.BOTH, enum: MenuServeAt })
  @IsEnum(MenuServeAt)
  @IsOptional()
  serveAt?: MenuServeAt;

  @ApiPropertyOptional({
    description: 'Counter / walk-in price. Required unless the item is served in rooms only.',
    example: 40,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price?: number | null;

  @ApiPropertyOptional({
    description: 'In-room dining price. Required unless the item is served at the counter only.',
    example: 60,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  roomPrice?: number | null;
}
