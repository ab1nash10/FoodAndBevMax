import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @Matches(/^\d{10}$/)
  mobile?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  otp!: string;
}
