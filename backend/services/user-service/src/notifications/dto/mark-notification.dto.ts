import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class MarkNotificationDto {
  @ApiPropertyOptional({ default: true, description: 'False marks the notification unread again.' })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
