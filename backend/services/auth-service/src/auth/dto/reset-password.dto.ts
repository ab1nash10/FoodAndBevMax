import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

/** A forgotten password, replaced with a one-time code sent to the account's email. */
export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  otp!: string;

  // The same rule an administrator's create/update and Preferences apply.
  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d).{8,}/, {
    message: 'Password must be at least 8 characters and include a letter and number.',
  })
  newPassword!: string;
}
