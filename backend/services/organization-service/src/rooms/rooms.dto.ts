import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ActivePaginationQueryDto } from '../common/dto/active-pagination-query.dto';

const trimmed = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreateRoomDto {
  @ApiProperty()
  @IsUUID()
  hospitalId!: string;

  /** For a dine-in table: the restaurant it stands in, at the same location. Blank: a room or bed. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  /** Kept as written: bed names such as "PG-ECO-06 (EWS)" are codes people read. */
  @ApiProperty({ example: 'PG-ECO-06 (EWS)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @trimmed()
  roomName!: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/** A room stays at its location, and a table at its restaurant: only name and status change. */
export class UpdateRoomDto extends PartialType(PickType(CreateRoomDto, ['isActive', 'roomName'])) {}

export const roomKinds = ['ROOM', 'TABLE'] as const;

export const roomSortFields = [
  'roomName',
  'roomCode',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;

export class ListRoomsQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  /** ROOM: rooms and beds only. TABLE: dine-in tables only. Blank: both. */
  @ApiPropertyOptional({ enum: roomKinds })
  @IsIn(roomKinds)
  @IsOptional()
  kind?: (typeof roomKinds)[number];

  /** One restaurant's tables. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiPropertyOptional({ default: 'createdAt', enum: roomSortFields })
  @IsIn(roomSortFields)
  @IsOptional()
  sortBy?: (typeof roomSortFields)[number];
}
