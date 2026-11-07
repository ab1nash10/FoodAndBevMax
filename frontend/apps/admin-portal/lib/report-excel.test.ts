import { strict as assert } from 'node:assert';
import type { ReportResult } from '@aahar/api-client';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { downloadReportExcel } from './report-excel';

// The writer is swapped for one that keeps what it was given, so the sheet can be checked.
const written = vi.hoisted(() => {
  const state: { options: unknown; sheet: unknown[][] } = { options: null, sheet: [] };
  return state;
});
vi.mock('write-excel-file/universal', () => ({
  default: (sheet: unknown[][], options: unknown) => {
    written.sheet = sheet;
    written.options = options;
    return { toBlob: () => Promise.resolve(new Blob(['x'])) };
  },
}));

let link: { click: ReturnType<typeof vi.fn>; download: string; href: string };
let revoke: ReturnType<typeof vi.fn<(url: string) => void>>;

beforeEach(() => {
  link = { click: vi.fn(), download: '', href: '' };
  vi.stubGlobal('document', { createElement: () => link });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
  revoke = vi.fn<(url: string) => void>();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 1 Oct 2026, 00:00 to 23:59 in India; downloaded at 9:15 the next morning.
const report = (extra: Partial<ReportResult> = {}): ReportResult => ({
  code: 'sales',
  columns: [
    { key: 'restaurant', kind: 'text', label: 'Restaurant' },
    { group: 'POS Orders', key: 'posCount', kind: 'number', label: 'Count' },
    { group: 'POS Orders', key: 'posAmount', kind: 'money', label: 'Amount' },
    { group: 'QR Orders', key: 'qrAmount', kind: 'money', label: 'Amount' },
  ],
  from: '2026-09-30T18:30:00Z',
  generatedAt: '2026-10-02T03:45:00Z',
  location: 'MAX - Max Saket, New Delhi',
  plain: false,
  restaurants: ['Cafe', 'Food Court'],
  rows: [{ posAmount: 1234.5, posCount: 3, qrAmount: null, restaurant: 'Cafe' }],
  title: 'Sales Report / Daily',
  to: '2026-10-01T18:29:00Z',
  totals: { posAmount: 1234.5, posCount: 3, qrAmount: 0, restaurant: '' },
  ...extra,
});

test('the heading block shows the period and download time in India time', async () => {
  await downloadReportExcel(report());
  assert.deepEqual(written.sheet.slice(0, 6), [
    [{ fontWeight: 'bold', value: 'Sales Report / Daily' }, null, null, null],
    [{ fontWeight: 'bold', value: 'Location' }, { value: 'MAX - Max Saket, New Delhi' }, null, null],
    [{ fontWeight: 'bold', value: 'From Date' }, { value: '01 Oct 2026' }, { value: '12:00 AM' }, null],
    [{ fontWeight: 'bold', value: 'To Date' }, { value: '01 Oct 2026' }, { value: '11:59 PM' }, null],
    [{ fontWeight: 'bold', value: 'Restaurant Names' }, { value: 'Cafe, Food Court' }, null, null],
    [{ fontWeight: 'bold', value: 'Date(Report Download)' }, { value: '02 Oct 2026 09:15 AM' }, null, null],
  ]);
});

test('column groups span their columns, then headings, rows and a bold total line', async () => {
  await downloadReportExcel(report());
  const [groups, headings, row, totals] = written.sheet.slice(6);
  assert.deepEqual(groups, [
    null,
    { columnSpan: 2, fontWeight: 'bold', value: 'POS Orders' },
    null,
    { columnSpan: 1, fontWeight: 'bold', value: 'QR Orders' },
  ]);
  assert.deepEqual(
    headings!.map((cell) => (cell as { value: string }).value),
    ['Restaurant', 'Count', 'Amount', 'Amount'],
  );
  // Money keeps two decimals, counts up to three; an empty value is an empty cell.
  assert.deepEqual(row, [
    { value: 'Cafe' },
    { format: '#,##0.###', value: 3 },
    { format: '#,##0.00', value: 1234.5 },
    null,
  ]);
  assert.deepEqual(totals, [
    null,
    { fontWeight: 'bold', format: '#,##0.###', value: 3 },
    { fontWeight: 'bold', format: '#,##0.00', value: 1234.5 },
    { fontWeight: 'bold', format: '#,##0.00', value: 0 },
  ]);
  assert.deepEqual(written.options, {
    columns: [{ width: 22 }, { width: 13 }, { width: 13 }, { width: 13 }],
    stickyRowsCount: 0,
  });
});

test('a plain report (ERP import) is just headings and rows, no heading block or totals', async () => {
  await downloadReportExcel(
    report({
      columns: [{ key: 'a', label: 'A' }],
      plain: true,
      rows: [{ a: 'x' }],
      totals: null,
    }),
  );
  assert.deepEqual(written.sheet, [[{ value: 'A' }], [{ value: 'x' }]]);
});

test('the file is named after the title and start date, and the link is let go', async () => {
  await downloadReportExcel(report());
  assert.equal(link.download, 'Sales-Report-Daily-01Oct2026.xlsx');
  assert.equal(link.href, 'blob:report');
  assert.equal(link.click.mock.calls.length, 1);
  assert.deepEqual(revoke.mock.calls, [['blob:report']]);
});
