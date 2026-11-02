import { NO_ENTITY_ID } from '@aahar/logging';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { recordNames } from './record-names';

/** A CSV export stops here; narrow the filters for more. */
export const EXPORT_ROW_LIMIT = 100_000;
const EXPORT_PAGE = 1000;

const auditSelect = {
  action: true,
  actorRole: true,
  createdAt: true,
  entityId: true,
  entityName: true,
  hospitalId: true,
  id: true,
  ipAddress: true,
  locationId: true,
  newValue: true,
  oldValue: true,
  requestId: true,
  source: true,
  summary: true,
  user: { select: { id: true, name: true } },
  userId: true,
} satisfies Prisma.AuditLogSelect;

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }> & {
  /** The record's name today (an item, a POS device, a bill number); null when it has none. */
  recordName?: string | null;
};

/** Newest first; the cursor is the last row's (createdAt, id). */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [time, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(time ?? '');

  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException('cursor is not valid; start from the first page.');
  }

  return { createdAt, id };
}

/**
 * The filters as a Prisma where. `allowed` is the caller's hospitals (null for every hospital):
 * a limited user sees only rows of their own locations, never rows without one (sign-ins,
 * shared masters), which belong to no location they manage.
 */
export function auditWhere(
  query: AuditLogQueryDto,
  allowed: string[] | null,
): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [{ deletedAt: null }];

  if (query.entityName) and.push({ entityName: query.entityName });
  if (query.entityId) and.push({ entityId: query.entityId });
  if (query.action) and.push({ action: query.action });
  if (query.userId) and.push({ userId: query.userId });
  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      },
    });
  }
  if (query.q?.trim()) and.push({ summary: { contains: query.q.trim(), mode: 'insensitive' } });

  if (query.hospitalId) {
    and.push({ hospitalId: query.hospitalId });
  } else if (allowed) {
    and.push({ hospitalId: { in: allowed } });
  }

  if (query.cursor) {
    const { createdAt, id } = decodeCursor(query.cursor);
    and.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
  }

  return { AND: and };
}

/** One CSV field: quoted when needed, and never read by a spreadsheet as a formula. */
export function csvField(value: unknown): string {
  let text: string;

  if (value === null || value === undefined) return '';
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else text = JSON.stringify(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS: Array<[string, (row: AuditRow) => unknown]> = [
  ['createdAt', (row) => row.createdAt],
  ['action', (row) => row.action],
  ['entityName', (row) => row.entityName],
  ['entityId', (row) => row.entityId],
  ['recordName', (row) => row.recordName],
  ['summary', (row) => row.summary],
  ['user', (row) => row.user?.name ?? row.userId],
  ['actorRole', (row) => row.actorRole],
  ['hospitalId', (row) => row.hospitalId],
  ['locationId', (row) => row.locationId],
  ['source', (row) => row.source],
  ['requestId', (row) => row.requestId],
  ['ipAddress', (row) => row.ipAddress],
  ['oldValue', (row) => row.oldValue],
  ['newValue', (row) => row.newValue],
];

export const CSV_HEADER = CSV_COLUMNS.map(([name]) => name).join(',');

export function csvLine(row: AuditRow): string {
  return CSV_COLUMNS.map(([, read]) => csvField(read(row))).join(',');
}

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: AuditLogQueryDto, allowed: string[] | null) {
    const limit = query.limit ?? 50;
    const rows = await this.prisma.auditLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: auditSelect,
      take: limit + 1,
      where: auditWhere(query, allowed),
    });
    const page = rows.slice(0, limit);
    const names = await recordNames(this.prisma, page);
    const items = page.map((row) => ({
      ...row,
      recordName: names.get(`${row.entityName}:${row.entityId}`) ?? null,
    }));
    const last = items[items.length - 1];

    return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
  }

  /** Writes the matching rows as CSV, page by page, and records the export itself. */
  async export(
    query: AuditLogQueryDto,
    allowed: string[] | null,
    write: (chunk: string) => Promise<void>,
  ): Promise<number> {
    let cursor = query.cursor;
    let count = 0;

    await write(`${CSV_HEADER}\n`);

    while (count < EXPORT_ROW_LIMIT) {
      const page = await this.list(
        { ...query, cursor, limit: Math.min(EXPORT_PAGE, EXPORT_ROW_LIMIT - count) },
        allowed,
      );

      if (page.items.length > 0) {
        await write(`${page.items.map(csvLine).join('\n')}\n`);
        count += page.items.length;
      }

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    const { cursor: _cursor, limit: _limit, ...filters } = query;
    await this.auditLog.record({
      action: 'EXPORT',
      entityId: NO_ENTITY_ID,
      entityName: 'audit_logs',
      hospitalId: query.hospitalId ?? null,
      newValue: { filters, rows: count },
      summary: `Exported ${count} audit rows`,
    });

    return count;
  }
}
