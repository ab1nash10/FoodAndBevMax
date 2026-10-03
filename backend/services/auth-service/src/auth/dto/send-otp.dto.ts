import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, Matches } from 'class-validator';

export class SendOtpDto {
  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @Matches(/^\d{10}$/)
  mobile?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;
}
