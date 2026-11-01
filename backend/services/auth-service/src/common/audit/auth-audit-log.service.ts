import { AuditService, type AuditClient } from '@aahar/logging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Sign-in and session events, from the event catalogue in docs/logging.md. */
export type AuthAuditAction =
  | 'LOGIN_FAILED'
  | 'LOGIN_SUCCESS'
  | 'LOGOUT'
  | 'OTP_FAILED'
  | 'OTP_SENT'
  | 'PASSWORD_CHANGED'
  | 'SESSION_REFRESHED'
  | 'SESSION_REVOKED';

interface AuthAuditInput {
  action: AuthAuditAction;
  entityId: string;
  /** Defaults to auth_sessions; `users` for events about the account itself. */
  entityName?: string;
  ipAddress?: string;
  newValue?: unknown;
  oldValue?: unknown;
  summary?: string;
  userId?: string;
}

/**
 * auth-service's door to the shared AuditService (@aahar/logging). Security events are not
 * part of a business transaction, so they are saved in the background and never fail a sign-in.
 */
@Injectable()
export class AuthAuditLogService {
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaService) {
    this.audit = new AuditService(prisma);
  }

  record(input: AuthAuditInput, client?: AuditClient): Promise<void> {
    return this.audit.record(
      {
        action: input.action,
        actorId: input.userId,
        entityId: input.entityId,
        entityName: input.entityName ?? 'auth_sessions',
        // Sign-in events belong to no one location.
        hospitalId: null,
        ipAddress: input.ipAddress,
        newValue: input.newValue,
        oldValue: input.oldValue,
        summary: input.summary,
      },
      client && client !== this.prisma ? { tx: client } : {},
    );
  }
}
