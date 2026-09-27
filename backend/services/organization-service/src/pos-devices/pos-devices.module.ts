import { Module } from '@nestjs/common';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PosDevicesController } from './pos-devices.controller';
import { PosDevicesRepository } from './pos-devices.repository';
import { PosDevicesService } from './pos-devices.service';

@Module({
  controllers: [PosDevicesController],
  providers: [AuditLogService, PosDevicesRepository, PosDevicesService, PrismaService],
})
export class PosDevicesModule {}
