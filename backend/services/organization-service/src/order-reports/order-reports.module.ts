import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PosModule } from '../pos/pos.module';
import { OrderReportsController } from './order-reports.controller';
import { OrderReportsService } from './order-reports.service';

@Module({
  controllers: [OrderReportsController],
  imports: [CommonModule, PosModule],
  providers: [OrderReportsService],
})
export class OrderReportsModule {}
