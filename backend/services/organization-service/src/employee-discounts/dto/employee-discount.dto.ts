import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { EmploymentType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { DisplayName } from '../../common/display-name.decorator';
import { toOptionalBoolean } from '../../common/values';
import { RestaurantMenuDayOfWeek } from '../../restaurant-menus/dto/create-restaurant-menu.dto';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateEmployeeDiscountDto {
  @ApiProperty({ example: 'Staff lunch 30%' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @DisplayName()
  name!: string;

  @ApiProperty()
  @IsUUID()
  restaurantId!: string;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  discountPercent!: number;

  @ApiPropertyOptional({
    description: 'Employee level; null for every employee.',
    enum: EmploymentType,
    nullable: true,
  })
  @IsEnum(EmploymentType)
  @ValidateIf((_body, value) => value !== null && value !== undefined)
  employmentType?: EmploymentType | null;

  @ApiPropertyOptional({
    description: 'Special timings start, HH:mm; empty for all day.',
    example: '12:00',
  })
  @Matches(timePattern, { message: 'startTime must use HH:mm format' })
  @ValidateIf((body: CreateEmployeeDiscountDto) => Boolean(body.startTime || body.endTime))
  startTime?: string | null;

  @ApiPropertyOptional({ description: 'Special timings end, HH:mm.', example: '15:00' })
  @Matches(timePattern, { message: 'endTime must use HH:mm format' })
  @ValidateIf((body: CreateEmployeeDiscountDto) => Boolean(body.startTime || body.endTime))
  endTime?: string | null;

  @ApiPropertyOptional({
    description: 'Serve days; empty for every day.',
    enum: RestaurantMenuDayOfWeek,
    isArray: true,
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(RestaurantMenuDayOfWeek, { each: true })
  @IsOptional()
  daysOfWeek?: RestaurantMenuDayOfWeek[];
}

export class UpdateEmployeeDiscountDto extends PartialType(CreateEmployeeDiscountDto) {
  @ApiPropertyOptional({ description: 'Archive (true) or restore (false) the rule.' })
  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}

export const employeeDiscountSortFields = ['createdAt', 'discountPercent', 'name'] as const;

export class ListEmployeeDiscountsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  restaurantId?: string;

  @ApiPropertyOptional({ description: 'Only this location’s restaurants.' })
  @IsUUID()
  @IsOptional()
  hospitalId?: string;

  @ApiPropertyOptional({
    description: 'true: archived only; false (default): live only.',
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  archived?: boolean;

  @ApiPropertyOptional({ default: 'createdAt', enum: employeeDiscountSortFields })
  @IsIn(employeeDiscountSortFields)
  @IsOptional()
  sortBy?: (typeof employeeDiscountSortFields)[number];
}
