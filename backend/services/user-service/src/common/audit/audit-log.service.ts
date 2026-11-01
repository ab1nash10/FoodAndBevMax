import { AuditService, type AuditClient } from '@aahar/logging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AuditRecordInput {
  action: string;
  actorId?: string;
  entityId: string;
  entityName: string;
  hospitalId?: string | null;
  ipAddress?: string;
  locationId?: string | null;
  newValue?: unknown;
  oldValue?: unknown;
  summary?: string;
}

/**
 * This service's door to the shared AuditService (@aahar/logging), kept so existing callers stay
 * as they are. Passing the transaction client writes the row inside that transaction; without
 * one the row is saved in the background and never fails the request.
 */
@Injectable()
export class AuditLogService {
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaService) {
    this.audit = new AuditService(prisma);
  }

  record(input: AuditRecordInput, client?: AuditClient): Promise<void> {
    return this.audit.record(input, client && client !== this.prisma ? { tx: client } : {});
  }
}
