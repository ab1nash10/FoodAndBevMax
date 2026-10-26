import { UserStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisplayName } from '../../common/display-name.decorator';

// Left out = unchanged; null is checked like any value (only designation may be null).
const Optional = () => ValidateIf((_, value) => value !== undefined);

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @Optional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  @DisplayName()
  name?: string;

  @ApiPropertyOptional({ example: '9999999999' })
  @Optional()
  @Matches(/^\d{10}$/)
  mobile?: string;

  @ApiPropertyOptional({ example: 'john@test.com' })
  @IsEmail()
  @Optional()
  email?: string;

  @ApiPropertyOptional({ format: 'password', minLength: 8 })
  @Optional()
  @IsString()
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d).{8,}/, {
    message: 'Password must be at least 8 characters and include a letter and number.',
  })
  password?: string;

  @ApiPropertyOptional({
    description: 'Required to change your own password, email or mobile.',
    format: 'password',
  })
  @Optional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @Optional()
  status?: UserStatus;

  @ApiPropertyOptional()
  @Optional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ description: 'null clears it', example: 'Store Manager', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string | null;

  @ApiPropertyOptional({ description: 'Path returned by the avatar upload endpoint.' })
  @Optional()
  @IsString()
  @MaxLength(500)
  // Rendered as an image source: the upload path or https, never javascript: or data: URLs.
  @Matches(/^(\/(?!\/)|https:\/\/)/, { message: 'avatarUrl must be a relative path or https URL' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Replaces the locations this user may operate in.',
    type: [String],
  })
  @Optional()
  @ArrayMaxSize(500)
  @IsArray()
  @IsUUID(undefined, { each: true })
  hospitalIds?: string[];
}
