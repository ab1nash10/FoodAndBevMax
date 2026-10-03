import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditClient = Pick<PrismaClient, 'auditLog'> | Prisma.TransactionClient;

interface AuthAuditInput {
  action: 'AUTH_LOGIN' | 'AUTH_LOGOUT' | 'AUTH_REFRESH';
  entityId: string;
  ipAddress?: string;
  newValue?: unknown;
  oldValue?: unknown;
  userId?: string;
}

function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AuthAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuthAuditInput, client: AuditClient = this.prisma): Promise<void> {
    await client.auditLog.create({
      data: {
        action: input.action,
        createdBy: input.userId,
        entityId: input.entityId,
        entityName: 'auth_sessions',
        ipAddress: input.ipAddress,
        newValue: toInputJson(input.newValue),
        oldValue: toInputJson(input.oldValue),
        updatedBy: input.userId,
        userId: input.userId,
      },
    });
  }
}
