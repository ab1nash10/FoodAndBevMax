import { maxImportRows, type ImportColumn } from '@/lib/import-file';

interface TemplateSource {
  columns: ImportColumn[];
  filename: string;
  matching: string;
  noun: string;
  /** Saved row by row (a bad row is skipped), rather than every row or none. */
  savesEachRow?: boolean;
}

type Cell = {
  backgroundColor?: string;
  fontWeight?: 'bold';
  textColor?: string;
  value: string;
  wrap?: boolean;
} | null;

const requiredFill = '#DBEAFE';
const optionalFill = '#F1F5F9';

/**
 * An .xlsx to fill in: the first sheet (the one the import reads) has just the column headers,
 * required ones shaded blue; an Instructions sheet says what each column takes and what the
 * server refuses, so a file is right before it is chosen. The writer loads only when used.
 */
export async function downloadImportTemplate(source: TemplateSource) {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const { columns, noun } = source;
  const header: Cell[] = columns.map((column) => ({
    backgroundColor: column.required ? requiredFill : optionalFill,
    fontWeight: 'bold',
    value: column.header,
  }));
  // Not merged or wrapped: Excel doesn't grow a merged row, and the text runs on over empty cells.
  const note = (value: string): Cell[] => [{ value }, null, null, null];
  const sheetName = noun.charAt(0).toUpperCase() + noun.slice(1);
  const instructions: Cell[][] = [
    [
      { fontWeight: 'bold', value: `Import ${noun}: how to fill in the template` },
      null,
      null,
      null,
    ],
    note(`Fill in the "${sheetName}" sheet, one row each. ${source.matching}`),
    note(
      'Blue columns are required on every row; grey ones may be left blank. Keep the header row as it is; columns may be in any order and extra columns are ignored.',
    ),
    note(
      `Up to ${maxImportRows.toLocaleString('en-IN')} rows per file, saved as .xlsx or .csv. Only the first sheet is read.`,
    ),
    note(
      source.savesEachRow
        ? 'Rows are saved one at a time. A row that breaks a rule below is not imported and is listed, with its problem, when the import ends; the other rows are saved.'
        : 'Every row is checked before anything is saved. If any row breaks a rule below, nothing is imported: the import panel lists each row’s problems so you can fix them and choose the file again.',
    ),
    [null, null, null, null],
    ['Column', 'Required', 'Rules', 'Example'].map((value) => ({
      backgroundColor: requiredFill,
      fontWeight: 'bold',
      value,
    })),
    ...columns.map((column): Cell[] => [
      { fontWeight: 'bold', value: column.header },
      column.required
        ? { textColor: '#1D4ED8', value: 'Required' }
        : { textColor: '#64748B', value: 'Optional' },
      { value: column.hint, wrap: true },
      column.example ? { value: column.example } : null,
    ]),
  ];

  const blob = await writeExcelFile([
    {
      columns: columns.map((column) => ({ width: Math.max(14, column.header.length + 4) })),
      data: [header],
      sheet: sheetName,
      stickyRowsCount: 1,
    },
    {
      columns: [{ width: 26 }, { width: 11 }, { width: 80 }, { width: 28 }],
      data: instructions,
      sheet: 'Instructions',
    },
  ]).toBlob();
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${source.filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
