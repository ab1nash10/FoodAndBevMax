import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { TransfersController } from './transfers.controller';
import { TransfersRepository } from './transfers.repository';
import { TransfersService } from './transfers.service';

@Module({
  controllers: [TransfersController],
  imports: [CommonModule],
  providers: [TransfersRepository, TransfersService],
})
export class TransfersModule {}
