import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ReportsModule } from '../reports/reports.module';
import { ErpPostingsController } from './erp-postings.controller';
import { ErpPostingsService } from './erp-postings.service';

@Module({
  controllers: [ErpPostingsController],
  imports: [CommonModule, ReportsModule],
  providers: [ErpPostingsService],
})
export class ErpPostingsModule {}
