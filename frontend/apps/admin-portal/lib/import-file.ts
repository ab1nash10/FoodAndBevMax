import { parseCsv } from '@/lib/csv';

/** The server takes up to 1,000 rows an import; a bigger file is refused before it is sent. */
export const maxImportRows = 1000;
export const maxImportBytes = 5 * 1024 * 1024;

export interface ImportColumn {
  /** Example value for the template's one example row. */
  example: string;
  /** The field the server reads this column into. */
  field: string;
  header: string;
  /** What to fill in, shown beside the column in the import panel. */
  hint: string;
  required?: boolean;
}

/** A spreadsheet's first sheet (.xlsx) or a .csv file as rows of cell text. */
export async function readImportFile(file: File): Promise<string[][]> {
  if (file.size > maxImportBytes) {
    throw new Error('This file is over 5 MB. Split it into smaller files.');
  }

  if (/\.csv$/i.test(file.name)) {
    return parseCsv(await file.text());
  }

  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error('Choose an Excel (.xlsx) or CSV file. Save older .xls files as .xlsx first.');
  }

  // Loaded only when a spreadsheet is chosen, so list pages don't carry it.
  const { readSheet } = await import('read-excel-file/browser');
  // Numbers kept as typed, so a mobile number or code like 007 isn't turned into a number.
  const sheet = await readSheet<string>(file, { parseNumber: (value) => value });

  return sheet
    .map((row) => row.map((cell) => (cell === null ? '' : String(cell))))
    .filter((row) => row.some((cell) => cell.trim() !== ''));
}

/**
 * Rows under the header as { field: cell } for the server. Columns are found by their header,
 * ignoring case, so their order doesn't matter and extra columns (an export's read-only ones)
 * are ignored. Throws an Error that says what is wrong with the file.
 */
export function tableToImportRows(
  table: string[][],
  columns: ImportColumn[],
): Array<Record<string, string>> {
  const [header = [], ...body] = table;
  const positions = new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));
  const present = columns.filter((column) => positions.has(column.header.toLowerCase()));
  const missing = columns
    .filter((column) => column.required && !present.includes(column))
    .map((column) => column.header);

  if (missing.length > 0) {
    throw new Error(
      `Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Download the template to see the columns.`,
    );
  }

  if (body.length === 0) {
    throw new Error('The file has no rows under its header.');
  }

  if (body.length > maxImportRows) {
    throw new Error(
      `This file has ${body.length.toLocaleString('en-IN')} rows. Import up to ${maxImportRows.toLocaleString('en-IN')} at a time.`,
    );
  }

  return body.map((cells) =>
    Object.fromEntries(
      present.map((column) => [
        column.field,
        (cells[positions.get(column.header.toLowerCase()) ?? -1] ?? '').trim(),
      ]),
    ),
  );
}
