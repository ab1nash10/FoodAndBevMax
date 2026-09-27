import { RecordStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Admin' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'System Administrator' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ enum: RecordStatus })
  @IsEnum(RecordStatus)
  @IsOptional()
  status?: RecordStatus;

  @ApiPropertyOptional({ isArray: true, type: String })
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
