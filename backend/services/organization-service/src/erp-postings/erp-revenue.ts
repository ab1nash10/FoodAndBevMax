// The ERP's revenue API (iwebmax /MaxLabEMS/api/fnb/revenue) takes the ERP Journal (SUN) lines
// as JSON. Its field names are the journal columns as its .NET model spells them ("suN_BU",
// "accounT_CODE", "afS_1".."afS_5" but "afs_6".."afs_25"), so they are derived, not retyped.
// Pure: rows in, request body out; and the answer read back.
import { HEADERS } from '../reports/erp-journal';
import type { ReportRow } from '../reports/report-builders';

const NUMBERS = new Set(['AMOUNT', 'MEMO_AMT', 'UNQ_ID']);

/** "SUN_BU" → "suN_BU", "LEDGER" → "ledger", "AFS_6" → "afs_6" (the ERP's own spelling). */
export function revenueKey(header: string): string {
  const afs = /^AFS_(\d+)$/.exec(header);
  if (afs && Number(afs[1]) >= 6) return header.toLowerCase();

  const [first = '', ...rest] = header.split('_');
  if (!rest.length) return header.toLowerCase();
  return [first.slice(0, -1).toLowerCase() + first.slice(-1), ...rest].join('_');
}

export function revenuePayload(rows: ReportRow[]) {
  return {
    userInfo: '',
    fnBRevenueList: rows.map((row) =>
      Object.fromEntries(
        HEADERS.map((header) => {
          const value = row[header];
          return [
            revenueKey(header),
            NUMBERS.has(header)
              ? Number(value ?? 0)
              : value === null || value === undefined
                ? ''
                : String(value),
          ];
        }),
      ),
    ),
  };
}

/** The ERP saved the lines only when it answers 2xx with { success: true }. */
export function revenueSucceeded(
  status: number,
  body: string,
): { error: string; ok: false } | { ok: true } {
  if (status < 200 || status >= 300)
    return { error: `The ERP answered HTTP ${status}.`, ok: false };

  let answer: { message?: unknown; success?: unknown };
  try {
    answer = JSON.parse(body) as typeof answer;
  } catch {
    return { error: 'The ERP did not answer with JSON.', ok: false };
  }

  return answer.success === true
    ? { ok: true }
    : {
        error:
          typeof answer.message === 'string' && answer.message
            ? answer.message
            : 'The ERP refused the lines.',
        ok: false,
      };
}
