import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CountersController } from './counters.controller';
import { CountersRepository } from './counters.repository';
import { CountersService } from './counters.service';

@Module({
  controllers: [CountersController],
  imports: [CommonModule],
  providers: [CountersRepository, CountersService],
})
export class CountersModule {}
