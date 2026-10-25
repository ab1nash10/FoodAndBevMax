import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  imports: [CommonModule],
  providers: [ReportsService],
})
export class ReportsModule {}
