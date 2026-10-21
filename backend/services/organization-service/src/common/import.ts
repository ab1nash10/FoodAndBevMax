import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsObject,
  validate,
} from 'class-validator';
import type { ActorContext } from './request-context';

/**
 * Bulk import from a spreadsheet: the portal sends every row, first as a dry run that saves
 * nothing and reports each row's problems, then for real, all rows in one transaction.
 */

/** The most rows one import takes; the portal refuses a bigger file before sending it. */
export const maxImportRows = 1000;

/** An import writes up to a thousand rows and their audit entries in one go. */
export const importTransactionOptions = { maxWait: 10_000, timeout: 60_000 };

export class ImportRowsDto {
  @ApiProperty({
    description: "One object per spreadsheet row: each cell's text under its field name.",
    items: { type: 'object' },
    type: 'array',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'The file has no rows to import' })
  @ArrayMaxSize(maxImportRows, {
    message: `Import up to ${maxImportRows.toLocaleString('en-IN')} rows at a time`,
  })
  @IsObject({ each: true })
  rows!: Array<Record<string, unknown>>;

  @ApiProperty({ description: 'Check every row and report what would happen, saving nothing.' })
  @IsBoolean()
  dryRun!: boolean;
}

export type ImportAction = 'create' | 'skip' | 'update';

/** What happens to one row (a row with nothing to change is skipped), or why it can't. */
export interface ImportRowResult {
  action: ImportAction;
  errors: string[];
}

export function importResult(rows: ImportRowResult[], imported: boolean) {
  const count = (action: ImportAction) =>
    rows.filter((row) => row.action === action && row.errors.length === 0).length;

  return {
    created: count('create'),
    // False on a dry run, and on a real one refused because a row has errors.
    imported,
    rows,
    skipped: count('skip'),
    updated: count('update'),
  };
}

/** A cell's trimmed text; anything but text, a number or a yes/no is blank. */
export function cellText(row: Record<string, unknown>, field: string): string {
  const value = row[field];

  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value).trim()
    : '';
}

const yesNoOptions = {
  '0': false,
  '1': true,
  false: false,
  n: false,
  no: false,
  true: true,
  y: true,
  yes: true,
};

/**
 * One row's cells as people type them: trimmed text with blank as undefined, and choices
 * matched ignoring case, spaces and punctuation ("Non-veg", "NON VEG"). A cell that fits none of
 * its choices adds to `errors` and reads as undefined.
 */
export function cellReader(row: Record<string, unknown>) {
  const errors: string[] = [];
  // Fields already reported, so the DTO's own message for them is not added on top.
  const failed = new Set<string>();
  const fail = (field: string, message: string) => {
    failed.add(field);
    errors.push(message);
  };
  const text = (field: string): string | undefined => cellText(row, field) || undefined;
  const choice = <T>(
    field: string,
    label: string,
    options: Record<string, T>,
    allowed: string,
  ): T | undefined => {
    const cell = text(field);

    if (cell === undefined) {
      return undefined;
    }

    const key = cell.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (Object.hasOwn(options, key)) {
      return options[key];
    }

    fail(field, `${label} must be ${allowed}`);
    return undefined;
  };

  return {
    choice,
    errors,
    fail,
    failed,
    /** A cell the row can't do without. */
    required: (field: string, label: string) => {
      const cell = text(field);

      if (cell === undefined) {
        fail(field, `${label} is required`);
      }

      return cell;
    },
    status: (field: string) =>
      choice(field, 'Status', { active: true, inactive: false }, 'Active or Inactive'),
    text,
    upper: (field: string) => text(field)?.toUpperCase(),
    yesNo: (field: string, label: string) => choice(field, label, yesNoOptions, 'Yes or No'),
  };
}

/**
 * The create DTO's own rules (and its transforms: Title Case names, upper-case codes) on one
 * row. A message names the column, "Item name must be …", rather than the field.
 */
export async function validateRow<T extends object>(
  dtoClass: ClassConstructor<T>,
  plain: object,
  labels: Record<string, string>,
  reported: ReadonlySet<string> = new Set(),
): Promise<{ dto: T; errors: string[] }> {
  const dto = plainToInstance(dtoClass, plain);
  const failures = (await validate(dto)).filter((failure) => !reported.has(failure.property));

  return {
    dto,
    errors: failures.flatMap((failure) =>
      Object.values(failure.constraints ?? {}).map((message) =>
        message.startsWith(failure.property)
          ? `${labels[failure.property] ?? failure.property}${message.slice(failure.property.length)}`
          : message,
      ),
    ),
  };
}

/** A row's number in the file as a spreadsheet shows it: the header is row 1. */
export const fileRow = (index: number) => index + 2;

/** Remembers the first row with each key; for a later one, says which row had it first. */
export function repeatTracker(what: string) {
  const seen = new Map<string, number>();

  return (key: string | undefined, index: number): string | null => {
    if (!key) {
      return null;
    }

    const first = seen.get(key);

    if (first === undefined) {
      seen.set(key, index);
      return null;
    }

    return `Row ${fileRow(first)} has the same ${what}`;
  };
}

/** Whether saving `next` would change any of `existing`'s values (undefined keeps a value). */
export function changes(existing: Record<string, unknown>, next: Record<string, unknown>): boolean {
  // Compared as text, so a stored Decimal 40.50 equals the number 40.5, and null equals blank.
  const text = (value: unknown) =>
    value instanceof Prisma.Decimal ? value.toString() : cellText({ value }, 'value');

  return Object.entries(next).some(
    ([key, value]) => value !== undefined && text(value) !== text(existing[key]),
  );
}

/** The permission a row needs: adding needs the create one, changing the update one. */
export function permissionError(
  action: ImportAction,
  context: ActorContext,
  codes: { create: string; update: string },
  noun: string,
): string | null {
  if (action === 'create' && !context.permissions?.includes(codes.create)) {
    return `You can't add ${noun}; this row would add one`;
  }

  if (action === 'update' && !context.permissions?.includes(codes.update)) {
    return `You can't change ${noun}; this row would change one`;
  }

  return null;
}

/** `count` numbers from a sequence in one query, lowest first. */
export async function nextSequenceValues(
  tx: Prisma.TransactionClient,
  sequence: 'item_code_sequence' | 'restaurant_menu_code_sequence',
  count: number,
): Promise<number[]> {
  if (count === 0) {
    return [];
  }

  const rows = await tx.$queryRawUnsafe<Array<{ nextValue: bigint }>>(
    `SELECT nextval('${sequence}')::bigint AS "nextValue" FROM generate_series(1, $1::int)`,
    count,
  );

  return rows.map((row) => Number(row.nextValue)).sort((a, b) => a - b);
}

/** Audit entries for an import's rows, written with one query (as AuditLogService.record maps them). */
export function importAuditEntries(
  entries: Array<{
    action: string;
    entityId: string;
    entityName: string;
    hospitalId?: string | null;
    newValue?: unknown;
    oldValue?: unknown;
  }>,
  context: ActorContext,
): Prisma.AuditLogCreateManyInput[] {
  const json = (value: unknown) =>
    value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

  return entries.map((entry) => ({
    action: entry.action,
    createdBy: context.actorId,
    entityId: entry.entityId,
    entityName: entry.entityName,
    hospitalId: entry.hospitalId ?? undefined,
    ipAddress: context.ipAddress,
    newValue: json(entry.newValue),
    oldValue: json(entry.oldValue),
    updatedBy: context.actorId,
    userId: context.actorId,
  }));
}
