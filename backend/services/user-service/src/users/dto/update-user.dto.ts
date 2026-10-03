import { UserStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '9999999999' })
  @IsOptional()
  @Matches(/^\d{10}$/)
  mobile?: string;

  @ApiPropertyOptional({ example: 'john@test.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ format: 'password', minLength: 8 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d).{8,}/, {
    message: 'Password must be at least 8 characters and include a letter and number.',
  })
  password?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ example: 'Store Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;

  @ApiPropertyOptional({ description: 'Path returned by the avatar upload endpoint.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  // Rendered as an image source: the upload path or https, never javascript: or data: URLs.
  @Matches(/^(\/(?!\/)|https:\/\/)/, { message: 'avatarUrl must be a relative path or https URL' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Replaces the locations this user may operate in.',
    type: [String],
  })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsArray()
  @IsUUID(undefined, { each: true })
  hospitalIds?: string[];
}
