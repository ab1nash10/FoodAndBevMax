import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { TimeSlotsController } from './time-slots.controller';
import { TimeSlotsRepository } from './time-slots.repository';
import { TimeSlotsService } from './time-slots.service';

@Module({
  controllers: [TimeSlotsController],
  imports: [CommonModule],
  providers: [TimeSlotsRepository, TimeSlotsService],
})
export class TimeSlotsModule {}
