import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'Admin' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'System Administrator' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
