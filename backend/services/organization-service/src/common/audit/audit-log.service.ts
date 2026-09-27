import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditClient = Pick<PrismaClient, 'auditLog'> | Prisma.TransactionClient;

interface AuditRecordInput {
  action: string;
  actorId?: string;
  entityId: string;
  entityName: string;
  hospitalId?: string;
  ipAddress?: string;
  newValue?: unknown;
  oldValue?: unknown;
}

function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput, client: AuditClient = this.prisma): Promise<void> {
    await client.auditLog.create({
      data: {
        action: input.action,
        createdBy: input.actorId,
        entityId: input.entityId,
        entityName: input.entityName,
        hospitalId: input.hospitalId,
        ipAddress: input.ipAddress,
        newValue: toInputJson(input.newValue),
        oldValue: toInputJson(input.oldValue),
        updatedBy: input.actorId,
        userId: input.actorId,
      },
    });
  }
}
