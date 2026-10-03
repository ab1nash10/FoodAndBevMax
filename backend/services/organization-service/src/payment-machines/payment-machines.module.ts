import { Module } from '@nestjs/common';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentMachinesController } from './payment-machines.controller';
import { PaymentMachinesRepository } from './payment-machines.repository';
import { PaymentMachinesService } from './payment-machines.service';

@Module({
  controllers: [PaymentMachinesController],
  providers: [AuditLogService, PaymentMachinesRepository, PaymentMachinesService, PrismaService],
})
export class PaymentMachinesModule {}
