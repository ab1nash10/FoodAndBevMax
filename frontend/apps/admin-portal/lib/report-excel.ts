import type { ReportResult } from '@aahar/api-client';

const date = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
});
const time = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  hour12: true,
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
const day = (value: string) => date.format(new Date(value));
const clock = (value: string) => time.format(new Date(value)).toUpperCase();

/**
 * The report as an .xlsx laid out like the old system's exports: title, location, from and to,
 * restaurants and download time, then column-group headings (POS / Room / QR orders), the
 * column headings, the rows and a bold total line. The writer loads only when it is used.
 */
export async function downloadReportExcel(report: ReportResult) {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  type Cell = {
    columnSpan?: number;
    fontWeight?: 'bold';
    format?: string;
    value: number | string;
  } | null;
  const bold = (value: string): Cell => ({ fontWeight: 'bold', value });
  const width = report.columns.length;
  const pad = (cells: Cell[]) => [
    ...cells,
    ...Array<Cell>(Math.max(0, width - cells.length)).fill(null),
  ];
  const cell = (
    value: number | string | null | undefined,
    kind?: string,
    isTotal = false,
  ): Cell => {
    if (value === null || value === undefined || value === '') return null;
    const shared = isTotal ? { fontWeight: 'bold' as const } : {};

    return typeof value === 'number'
      ? { ...shared, format: kind === 'money' ? '#,##0.00' : '#,##0.###', value }
      : { ...shared, value };
  };
  const sheet: Cell[][] = report.plain
    ? []
    : [
        pad([{ fontWeight: 'bold', value: report.title }]),
        pad([bold('Location'), { value: report.location }]),
        pad([bold('From Date'), { value: day(report.from) }, { value: clock(report.from) }]),
        pad([bold('To Date'), { value: day(report.to) }, { value: clock(report.to) }]),
        pad([bold('Restaurant Names'), { value: report.restaurants.join(', ') }]),
        pad([
          bold('Date(Report Download)'),
          { value: `${day(report.generatedAt)} ${clock(report.generatedAt)}` },
        ]),
      ];

  if (report.columns.some((column) => column.group)) {
    const groups: Cell[] = [];

    report.columns.forEach((column, index) => {
      const previous = report.columns[index - 1];
      if (!column.group || previous?.group === column.group) {
        groups.push(null);
        return;
      }
      const span = report.columns.slice(index).findIndex((next) => next.group !== column.group);
      groups.push({
        columnSpan: span === -1 ? width - index : span,
        fontWeight: 'bold',
        value: column.group,
      });
    });
    sheet.push(groups);
  }

  sheet.push(
    report.columns.map((column) => (report.plain ? { value: column.label } : bold(column.label))),
  );

  for (const row of report.rows) {
    sheet.push(report.columns.map((column) => cell(row[column.key], column.kind)));
  }

  if (report.totals) {
    sheet.push(
      report.columns.map((column) => cell(report.totals?.[column.key], column.kind, true)),
    );
  }

  const blob = await writeExcelFile(sheet, {
    columns: report.columns.map((column) => ({ width: column.kind === 'text' ? 22 : 13 })),
    stickyRowsCount: 0,
  }).toBlob();
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${report.title.replace(/[^\w-]+/g, '-')}-${day(report.from).replaceAll(' ', '')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
