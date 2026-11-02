import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description: 'Required once you have a password; left out to set your first one.',
    format: 'password',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword?: string;

  // The same rule an administrator's create/update applies, so both paths accept the same passwords.
  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d).{8,}/, {
    message: 'Password must be at least 8 characters and include a letter and number.',
  })
  newPassword!: string;
}
