import { AuditService, type AuditClient, type AuditEvent } from '@aahar/logging';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_PRISMA } from './access-resolver';

/** The old name for an audit event; same shape as @aahar/logging's AuditEvent. */
export type AuditLogEvent = AuditEvent;

/**
 * The shared AuditService on each service's Prisma client (AUTH_PRISMA). It used to only print
 * the event; it now saves it to audit_logs (see AuditService for the tx / background rules).
 */
@Injectable()
export class AuditLoggerService extends AuditService {
  constructor(@Inject(AUTH_PRISMA) prisma: AuditClient) {
    super(prisma);
  }
}
