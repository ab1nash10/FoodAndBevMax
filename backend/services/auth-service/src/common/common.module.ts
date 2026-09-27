import { Module } from '@nestjs/common';
import { AuthAuditLogService } from './audit/auth-audit-log.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Module({
  exports: [AuthAuditLogService, PrismaService, RedisService],
  providers: [AuthAuditLogService, PrismaService, RedisService],
})
export class CommonModule {}
