import { AUTH_PRISMA } from '@aahar/auth';
import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/audit-log.service';
import { PrismaService } from './prisma/prisma.service';

@Module({
  exports: [AUTH_PRISMA, AuditLogService, PrismaService],
  providers: [AuditLogService, PrismaService, { provide: AUTH_PRISMA, useExisting: PrismaService }],
})
export class CommonModule {}
