import { Injectable, Logger } from '@nestjs/common';

export interface AuditLogEvent {
  action: string;
  entityId?: string;
  entityName: string;
  ipAddress?: string;
  newValue?: unknown;
  oldValue?: unknown;
  requestId?: string;
  userId?: string;
}

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  record(event: AuditLogEvent): void {
    this.logger.log(
      JSON.stringify({
        ...event,
        event: 'audit_log',
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
