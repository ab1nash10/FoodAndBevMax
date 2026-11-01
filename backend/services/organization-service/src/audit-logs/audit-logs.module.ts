import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
  controllers: [AuditLogsController],
  imports: [CommonModule],
  providers: [AuditLogsService],
})
export class AuditLogsModule {}
