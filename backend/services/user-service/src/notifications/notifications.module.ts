import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  exports: [NotificationsService],
  imports: [CommonModule],
  providers: [NotificationsService],
})
export class NotificationsModule {}
