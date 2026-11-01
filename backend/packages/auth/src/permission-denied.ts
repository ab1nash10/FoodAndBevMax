import { logger, type AuditService } from '@aahar/logging';

const ONE_MINUTE_MS = 60_000;
const lastSaved = new Map<string, number>();

/**
 * True at most once a minute per key (user + route), so a page retrying a forbidden call cannot
 * flood audit_logs. ponytail: per process; each replica keeps its own minute. Move to Redis if a
 * single limit across replicas ever matters.
 */
export function shouldSaveDenial(key: string, now = Date.now()): boolean {
  const last = lastSaved.get(key);

  if (last !== undefined && now - last < ONE_MINUTE_MS) {
    return false;
  }

  if (lastSaved.size > 10_000) {
    lastSaved.clear();
  }

  lastSaved.set(key, now);
  return true;
}

export interface DeniedRequest {
  method?: string;
  route?: { path?: string };
  user?: { id: string };
}

/** A refused request: always a warning line, and an audit row once a minute per user + route. */
export function recordPermissionDenied(
  audit: AuditService | undefined,
  request: DeniedRequest,
  details: { hospitalId?: string; permissions?: string[]; reason: string; roles?: string[] },
): void {
  const userId = request.user?.id;
  const route = request.route?.path;
  const event = { method: request.method, route, ...details };

  logger.warn(event, 'permission_denied');

  if (!audit || !userId || !shouldSaveDenial(`${userId} ${request.method} ${route}`)) {
    return;
  }

  // The hospital asked for stays in the value: it may not exist, and the column is a foreign key.
  void audit.record({
    action: 'PERMISSION_DENIED',
    entityId: userId,
    entityName: 'users',
    hospitalId: null,
    newValue: event,
    summary: `${request.method ?? ''} ${route ?? ''} refused: ${details.reason}`.trim(),
  });
}
