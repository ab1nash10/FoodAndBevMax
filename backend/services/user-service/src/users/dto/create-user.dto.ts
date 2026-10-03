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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'EMP001' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  employeeCode!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '9999999999' })
  @Matches(/^\d{10}$/)
  mobile!: string;

  @ApiProperty({ example: 'john@test.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d).{8,}/, {
    message: 'Password must be at least 8 characters and include a letter and number.',
  })
  password!: string;

  @ApiProperty()
  @IsUUID()
  roleId!: string;

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
    description:
      'Locations (hospitals) this user may operate in. A SINGLE-scope role requires exactly one; a MULTI-scope role requires at least one; an ALL-scope role ignores this.',
    type: [String],
  })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsArray()
  @IsUUID(undefined, { each: true })
  hospitalIds?: string[];

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;
}
