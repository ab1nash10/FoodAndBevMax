import type { Prisma, PrismaClient } from '@prisma/client';
import { getRequestContext } from './context';
import { logger } from './logger';
import { scrubSecrets } from './redact';

/** The base client, or the transaction client of the change being recorded. */
export type AuditClient = Pick<PrismaClient, 'auditLog'> | Prisma.TransactionClient;

export interface AuditEvent {
  /** From the event catalogue (docs/logging.md). */
  action: string;
  entityName: string;
  entityId: string;
  /** Before and after: only the fields that differ are kept. One of them alone is kept whole. */
  oldValue?: unknown;
  newValue?: unknown;
  /** One line for people, e.g. "Accepted 18 of 20 kg basmati". */
  summary?: string;
  /** Each of these defaults from the request's context. */
  actorId?: string;
  hospitalId?: string | null;
  ipAddress?: string;
  locationId?: string | null;
}

/** For events about no particular record (a failed sign-in by an unknown user). */
export const NO_ENTITY_ID = '00000000-0000-0000-0000-000000000000';

/** Each saved value stays under this; a larger one is cut and marked. */
export const AUDIT_VALUE_LIMIT_BYTES = 16 * 1024;

/** Changed on every write; noise in a diff (the row's own created_at says when). */
const IGNORED_FIELDS = new Set(['updatedAt', 'updatedBy']);

type Json = Prisma.InputJsonValue;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** JSON-safe copy: Dates become ISO strings, Decimals strings, undefined disappears. */
function toJson(value: unknown): unknown {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown);
}

/**
 * The fields that changed between two versions of a record, as before/after halves. Values are
 * compared as JSON, so arrays (a GRN's lines) count as one field. With only one side present,
 * that side is kept whole: a create's new record, a delete's old one, or an event's payload.
 */
export function auditDiff(
  oldValue: unknown,
  newValue: unknown,
): { newValue?: unknown; oldValue?: unknown } {
  const before = toJson(oldValue);
  const after = toJson(newValue);

  if (!isPlainObject(before) || !isPlainObject(after)) {
    return { newValue: after, oldValue: before };
  }

  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_FIELDS.has(key) || JSON.stringify(before[key]) === JSON.stringify(after[key])) {
      continue;
    }

    changedBefore[key] = before[key] ?? null;
    changedAfter[key] = after[key] ?? null;
  }

  return { newValue: changedAfter, oldValue: changedBefore };
}

/** A value over the limit becomes `{ _truncated, bytes, preview }`, so the row always saves. */
export function capAuditValue(value: unknown, limit = AUDIT_VALUE_LIMIT_BYTES): unknown {
  if (value === undefined) {
    return undefined;
  }

  const text = JSON.stringify(value);
  const bytes = Buffer.byteLength(text);

  if (bytes <= limit) {
    return value;
  }

  // The preview leaves room for the marker; slicing by characters keeps it valid UTF-16.
  return { _truncated: true, bytes, preview: text.slice(0, Math.floor(limit / 2)) };
}

/**
 * The audit_logs row for an event: diffed, secrets scrubbed, capped, and the who/where filled in
 * from the request. A hospital comes from the request only when it is one of the caller's
 * assigned hospitals (real rows), since a bad id would fail the foreign key and, inside a
 * transaction, the change itself.
 */
export function auditRowData(event: AuditEvent): Prisma.AuditLogUncheckedCreateInput {
  const context = getRequestContext();
  const diff = auditDiff(scrubSecrets(event.oldValue), scrubSecrets(event.newValue));
  const actorId = event.actorId ?? context?.userId;
  const contextHospital =
    context?.hospitalId && context.locationIds?.includes(context.hospitalId)
      ? context.hospitalId
      : undefined;

  return {
    action: event.action,
    actorRole: context?.roles?.length ? context.roles.join(', ') : undefined,
    createdBy: actorId,
    entityId: event.entityId,
    entityName: event.entityName,
    hospitalId: event.hospitalId === undefined ? contextHospital : event.hospitalId,
    ipAddress: event.ipAddress ?? context?.ip,
    locationId: event.locationId === undefined ? context?.locationId : event.locationId,
    newValue: capAuditValue(diff.newValue) as Json | undefined,
    oldValue: capAuditValue(diff.oldValue) as Json | undefined,
    requestId: context?.requestId,
    source: context?.source ?? 'system',
    summary: event.summary?.slice(0, 500),
    updatedBy: actorId,
    userId: actorId,
  };
}

const RETRY_DELAYS_MS = [100, 400];

/**
 * Saves audit events to audit_logs.
 *
 * With `tx`, the row is written by the transaction of the change it records: it commits or rolls
 * back with it, and a failure fails the change (stock and money paths). Without, the write runs
 * in the background with up to three attempts and is never awaited by, or thrown into, the
 * request; a row that cannot be saved is logged as `audit_write_failed`.
 */
export class AuditService {
  constructor(
    private readonly prisma: AuditClient,
    private readonly retryDelaysMs = RETRY_DELAYS_MS,
  ) {}

  async record(event: AuditEvent, options: { tx?: AuditClient } = {}): Promise<void> {
    const data = auditRowData(event);

    if (options.tx) {
      await options.tx.auditLog.create({ data, select: { id: true } });
      return;
    }

    void this.writeInBackground(data);
  }

  private async writeInBackground(data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.prisma.auditLog.create({ data, select: { id: true } });
        return;
      } catch (error) {
        const delay = this.retryDelaysMs[attempt];

        if (delay === undefined) {
          logger.error(
            {
              action: data.action,
              attempts: attempt + 1,
              entityId: data.entityId,
              entityName: data.entityName,
              err: error,
            },
            'audit_write_failed',
          );
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
