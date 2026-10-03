import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { TransferAcknowledgementsController } from './transfer-acknowledgements.controller';
import { TransferAcknowledgementsRepository } from './transfer-acknowledgements.repository';
import { TransferAcknowledgementsService } from './transfer-acknowledgements.service';

@Module({
  controllers: [TransferAcknowledgementsController],
  imports: [CommonModule],
  providers: [TransferAcknowledgementsRepository, TransferAcknowledgementsService],
})
export class TransferAcknowledgementsModule {}
