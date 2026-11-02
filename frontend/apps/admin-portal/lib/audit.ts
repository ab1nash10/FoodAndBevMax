import type { AuditRow, ReportResult } from '@aahar/api-client';
import { parseCsv } from './csv';

/** The record types the audit log knows, in the order the filter lists them. */
const entityNames: Record<string, string> = {
  grns: 'GRN',
  transfers: 'Transfer',
  kitchen_productions: 'Kitchen production',
  items: 'Item',
  item_categories: 'Item category',
  item_prices: 'Item price',
  store_items: 'Store item',
  kitchen_items: 'Kitchen item',
  restaurant_menus: 'Restaurant menu',
  stores: 'Store',
  kitchens: 'Kitchen',
  restaurants: 'Restaurant',
  restaurant_staff_discounts: 'Restaurant discount',
  employee_discounts: 'Employee discount',
  counters: 'Counter',
  counter_shifts: 'Counter shift',
  pos_devices: 'POS device',
  payment_machines: 'Payment machine',
  time_slots: 'Time slot',
  legal_entities: 'Legal entity',
  hospitals: 'Hospital',
  locations: 'Location',
  employees: 'Employee',
  users: 'User',
  roles: 'Role',
  online_payments: 'Online payment',
  kiosk_orders: 'Kiosk order',
  restaurant_orders: 'Restaurant order',
  erp_postings: 'ERP posting',
  auth_sessions: 'Sign-in session',
  audit_logs: 'Audit log',
};

export const auditEntities = Object.entries(entityNames).map(([value, label]) => ({
  label,
  value,
}));

const acronyms = new Set(['grn', 'pos', 'id', 'otp', 'mrp', 'gst']);

/** "rejection_reason" / "acceptedQty" → "Rejection reason" / "Accepted qty"; ids say "ID". */
function sentence(words: string[]): string {
  const text = words.map((word) => (acronyms.has(word) ? word.toUpperCase() : word)).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

export function fieldLabel(key: string): string {
  return sentence(words(key));
}

export function entityLabel(name: string): string {
  return entityNames[name] ?? fieldLabel(name);
}

const whole: Record<string, string> = {
  CREATE: 'Created',
  DELETE: 'Deleted',
  EXPORT: 'Exported',
  LOGIN_FAILED: 'Sign-in failed',
  LOGIN_SUCCESS: 'Signed in',
  PERMISSION_DENIED: 'Permission denied',
  STATUS_CHANGE: 'Status changed',
  UPDATE: 'Updated',
};

const verbs: Array<[string, string]> = [
  ['_STATUS_CHANGE', 'status changed'],
  ['_ACKNOWLEDGE', 'acknowledged'],
  ['_DISPATCH', 'dispatched'],
  ['_CREATE', 'created'],
  ['_UPDATE', 'updated'],
  ['_DELETE', 'deleted'],
  ['_CANCEL', 'cancelled'],
  ['_POST', 'posted'],
];

/** "GRN_POST" → "GRN posted", "TRANSFER_ACKNOWLEDGE" → "Transfer acknowledged". */
export function actionLabel(action: string): string {
  if (whole[action]) return whole[action];
  const verb = verbs.find(([suffix]) => action.endsWith(suffix));
  const subject = verb ? action.slice(0, -verb[0].length) : action;
  return sentence([...words(subject), ...(verb ? [verb[1]] : [])]);
}

/** The colour of an action's chip: red for what undoes or refuses, green for a new record. */
export function actionTone(action: string): 'danger' | 'info' | 'neutral' | 'success' {
  if (/(CANCEL|DELETE|FAILED|DENIED)$/.test(action)) return 'danger';
  if (action.endsWith('CREATE')) return 'success';
  if (/(POST|DISPATCH|ACKNOWLEDGE)$/.test(action)) return 'info';
  return 'neutral';
}

/** One side of a change: text, or a small table for a list of records (lines, batches). */
export type AuditCell =
  { text: string } | { columns: Array<{ key: string; label: string }>; rows: string[][] };

/** A changed field; a side is missing when the record was created (no before) or deleted. */
export interface AuditChange {
  after?: AuditCell;
  before?: AuditCell;
  field: string;
  label: string;
}

const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const whenFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    return isoDateTime.test(value) ? whenFormatter.format(new Date(value)) : value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(text).join(', ') : '—';
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, inner]) => `${fieldLabel(key)}: ${text(inner)}`)
      .join(' · ');
  }
  return JSON.stringify(value);
}

function cell(value: unknown): AuditCell {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isRecord)) {
    return { text: text(value) };
  }
  const keys = [...new Set(value.flatMap((row) => Object.keys(row)))];
  return {
    columns: keys.map((key) => ({ key, label: fieldLabel(key) })),
    rows: value.map((row) => keys.map((key) => text(row[key]))),
  };
}

function asFields(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  return isRecord(value) ? value : { value };
}

/** An audit row's oldValue/newValue as one entry per field, in the order the record has them. */
export function auditChanges(row: Pick<AuditRow, 'newValue' | 'oldValue'>): AuditChange[] {
  const before = asFields(row.oldValue);
  const after = asFields(row.newValue);
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])];

  return keys.map((field) => ({
    ...(field in after ? { after: cell(after[field]) } : {}),
    ...(field in before ? { before: cell(before[field]) } : {}),
    field,
    label: fieldLabel(field),
  }));
}

/**
 * Two date inputs ("2026-10-01") as the API's range: from that day's midnight here, to the
 * midnight after the last day (the API's `to` is not included).
 */
export function dayRange(from: string, to: string): { from?: string; to?: string } {
  const midnight = (day: string, addDays = 0) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year!, month! - 1, date! + addDays).toISOString();
  };
  return { from: from ? midnight(from) : undefined, to: to ? midnight(to, 1) : undefined };
}

/**
 * The server's CSV export as a plain sheet for the Excel writer: one heading row (in words),
 * then the rows as exported. The export itself is still recorded on the server.
 */
export function auditCsvToReport(csv: string, generatedAt = new Date()): ReportResult {
  const [header = [], ...body] = parseCsv(csv);
  const at = generatedAt.toISOString();

  return {
    code: 'activity-logs',
    columns: header.map((key) => ({ key, kind: 'text', label: fieldLabel(key) })),
    from: at,
    generatedAt: at,
    location: '',
    plain: true,
    restaurants: [],
    rows: body.map((cells) =>
      Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ''])),
    ),
    title: 'Activity Logs',
    to: at,
    totals: null,
  };
}
