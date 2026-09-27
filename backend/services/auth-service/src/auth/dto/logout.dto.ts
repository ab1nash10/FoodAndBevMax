import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class LogoutDto {
  @ApiProperty()
  @IsJWT()
  refreshToken!: string;
}
