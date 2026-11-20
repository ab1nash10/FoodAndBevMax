import { AUTH_PRISMA } from '@aahar/auth';
import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/audit-log.service';
import { PrismaService } from './prisma/prisma.service';
import { StoreArrivals } from './store-arrivals';

@Module({
  exports: [AUTH_PRISMA, AuditLogService, PrismaService, StoreArrivals],
  providers: [
    AuditLogService,
    PrismaService,
    StoreArrivals,
    { provide: AUTH_PRISMA, useExisting: PrismaService },
  ],
})
export class CommonModule {}
