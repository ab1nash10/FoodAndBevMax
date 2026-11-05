'use client';

import { Button } from '@aahar/ui';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApiList, ApiResponse } from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage } from '@/lib/api';
import { ImportColumnList } from '@/components/import/import-dialog';
import { downloadCsv } from '@/lib/csv';
import { readImportFile, type ImportColumn } from '@/lib/import-file';
import { downloadImportTemplate } from '@/lib/import-template';

export interface CsvColumn<T> {
  /** For the import template's Instructions sheet. */
  example?: string;
  header: string;
  /** What to fill in and the rules a row must keep, shown in the import panel and template. */
  hint?: string;
  /** Needed on every row. */
  required?: boolean;
  /** For people reading the export (a name beside a code); an import neither needs nor uses it. */
  readOnly?: boolean;
  value: (row: T) => number | string | null | undefined;
}

/** The columns an import reads, as the import panel and its Excel template list them. */
export function templateColumns<T>(columns: Array<CsvColumn<T>>): ImportColumn[] {
  return columns
    .filter((column) => !column.readOnly)
    .map((column) => ({
      example: column.example ?? '',
      field: column.header,
      header: column.header,
      hint: column.hint ?? '',
      required: column.required,
    }));
}

/** One imported row: the cell under a header, trimmed; '' when blank. */
export type CsvCells = (header: string) => string;

/** Saves one imported row and says what it did; throws an Error saying what is wrong. */
export type CsvRowImporter = (cells: CsvCells) => Promise<'created' | 'updated'>;

/** Every page of a list, for exports and import lookups (the API serves 100 rows a page). */
export async function fetchAllPages<T>(
  load: (page: number) => Promise<ApiResponse<ApiList<T>>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 1; ; page += 1) {
    const { data } = await load(page);

    rows.push(...data.items);

    if (page >= data.meta.totalPages) {
      return rows;
    }
  }
}

/**
 * A name as the server compares it (normalizeMasterName): no accents, spaces or punctuation,
 * any case. "Soft Drinks" and "soft-drinks" are the same category; "Samosa!" the same item.
 */
export function nameKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** "Yes" / "No" cells; blank keeps `fallback`. */
export function yesNo(value: string, fallback: boolean, header: string): boolean {
  if (!value) {
    return fallback;
  }

  if (/^(yes|y|true|1)$/i.test(value)) {
    return true;
  }

  if (/^(no|n|false|0)$/i.test(value)) {
    return false;
  }

  throw new Error(`${header} must be Yes or No`);
}

/** "Active" / "Inactive" cells; blank keeps `fallback`. */
export function activeStatus(value: string, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  if (/^active$/i.test(value)) {
    return true;
  }

  if (/^inactive$/i.test(value)) {
    return false;
  }

  throw new Error('Status must be Active or Inactive');
}

/** A whole or decimal number cell; blank is null. */
export function numberCell(value: string, header: string, decimals = 0): number | null {
  if (!value) {
    return null;
  }

  const pattern = decimals ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;

  if (!pattern.test(value)) {
    throw new Error(
      `${header} must be ${decimals ? `a number with up to ${decimals} decimals` : 'a whole number'}`,
    );
  }

  return Number(value);
}

interface ImportResult {
  created: number;
  failures: Array<{ message: string; row: number }>;
  total: number;
  updated: number;
}

/**
 * Export and Import buttons for a list page. Export writes every row that matches the page's
 * filters; Import reads the same columns back, so an edited export imports too. Import opens a
 * panel with each column's rules and an Excel template, then reads an .xlsx or .csv file.
 * Rows are saved one at a time through the normal API, so every check and permission a form
 * has applies, and a bad row is reported without stopping the rest.
 */
export function CsvImportExport<T>({
  columns,
  exportRows,
  filename,
  matching,
  noun,
  onImported,
  startImport,
}: Readonly<{
  columns: Array<CsvColumn<T>>;
  exportRows: () => Promise<T[]>;
  /** File name without the date or extension, e.g. "items". */
  filename: string;
  /** How a row finds the record it updates, for the import panel and template. */
  matching?: string;
  /** Plural, lower case, e.g. "items". */
  noun: string;
  onImported: () => void;
  /** Loads what the rows refer to, once per import; omit to hide Import. */
  startImport?: () => Promise<CsvRowImporter>;
}>) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const importColumns = templateColumns(columns);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const isImporting = progress !== null && result === null;
  const stamp = () => new Date().toLocaleDateString('en-CA');

  async function runExport() {
    setIsExporting(true);

    try {
      const rows = await exportRows();

      downloadCsv(`${filename}-${stamp()}.csv`, [
        columns.map((column) => column.header),
        ...rows.map((row) => columns.map((column) => column.value(row) ?? '')),
      ]);
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: `Could not export ${noun}`,
        variant: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function runImport(file: File) {
    if (!startImport) {
      return;
    }

    let table: string[][];

    try {
      table = await readImportFile(file);
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: `This file can't be imported as ${noun}`,
        variant: 'error',
      });
      return;
    }

    const [header = [], ...rows] = table;
    const positions = new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));
    const missing = columns
      .filter((column) => !column.readOnly)
      .map((column) => column.header)
      .filter((name) => !positions.has(name.toLowerCase()));

    if (rows.length === 0 || missing.length > 0) {
      showToast({
        description:
          missing.length > 0
            ? `Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Download the template to see the columns.`
            : 'The file has no rows under its header.',
        title: `This file can't be imported as ${noun}`,
        variant: 'error',
      });
      return;
    }

    const outcome: ImportResult = { created: 0, failures: [], total: rows.length, updated: 0 };

    setResult(null);
    setProgress({ done: 0, total: rows.length });

    try {
      const importRow = await startImport();

      for (const [index, row] of rows.entries()) {
        const cells: CsvCells = (name) =>
          (row[positions.get(name.toLowerCase()) ?? -1] ?? '').trim();

        try {
          outcome[await importRow(cells)] += 1;
        } catch (error) {
          // Row 1 is the header, so the first data row is row 2, as a spreadsheet numbers it.
          outcome.failures.push({ message: getApiErrorMessage(error), row: index + 2 });
        }

        setProgress({ done: index + 1, total: rows.length });
      }
    } catch (error) {
      outcome.failures.push({ message: getApiErrorMessage(error), row: 0 });
    }

    setResult(outcome);
    onImported();
  }

  function closeResult() {
    setProgress(null);
    setResult(null);
  }

  return (
    <>
      <Button
        disabled={isExporting}
        onClick={() => void runExport()}
        title={`Download ${noun} as CSV`}
        type="button"
        variant="outline"
      >
        {isExporting ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        )}
        Export
      </Button>
      {startImport ? (
        <>
          <Button
            disabled={isImporting}
            onClick={() => setIsChoosing(true)}
            title={`Add or update ${noun} from an Excel or CSV file`}
            type="button"
            variant="outline"
          >
            <Upload aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            Import
          </Button>
          <input
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              // Cleared so choosing the same file again still imports it.
              event.target.value = '';

              if (file) {
                setIsChoosing(false);
                void runImport(file);
              }
            }}
            ref={fileRef}
            type="file"
          />
          {/* On the body: the page header the button sits in would otherwise clip the panel. */}
          {isChoosing
            ? createPortal(
                <Modal
                  description={matching}
                  onClose={() => setIsChoosing(false)}
                  open
                  side
                  title={`Import ${noun}`}
                >
                  <div className="grid gap-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={() => fileRef.current?.click()} type="button">
                        <FileSpreadsheet aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                        Choose file
                      </Button>
                      <Button
                        onClick={() =>
                          void downloadImportTemplate({
                            columns: importColumns,
                            filename: `${filename}-import-template`,
                            matching: matching ?? '',
                            noun,
                            savesEachRow: true,
                          })
                        }
                        type="button"
                        variant="ghost"
                      >
                        <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                        Download Excel template
                      </Button>
                    </div>
                    <p className="text-ds-text-2">
                      An Excel (.xlsx) or CSV file with these columns, in any order. Rows are saved
                      one at a time; a row with a problem is skipped and listed when the import
                      ends.
                    </p>
                    <ImportColumnList columns={importColumns} />
                  </div>
                </Modal>,
                document.body,
              )
            : null}
        </>
      ) : null}

      <Modal
        footer={
          result ? (
            <div className="flex justify-end">
              <Button onClick={closeResult} type="button">
                Done
              </Button>
            </div>
          ) : undefined
        }
        onClose={() => {
          // An import in progress keeps going; only a finished one can be dismissed.
          if (result) {
            closeResult();
          }
        }}
        open={progress !== null}
        title={result ? `Imported ${noun}` : `Importing ${noun}…`}
      >
        {result ? (
          <div className="grid gap-3 text-sm">
            <p className="text-ds-text">
              <strong>{result.created}</strong> added, <strong>{result.updated}</strong> updated
              {result.failures.length ? (
                <>
                  , <strong className="text-ds-status-bad-fg">{result.failures.length}</strong> not
                  imported
                </>
              ) : null}{' '}
              of {result.total} rows.
            </p>
            {result.failures.length ? (
              <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-control border border-ds-border p-3 text-[13px]">
                {result.failures.map((failure) => (
                  <li key={`${failure.row}-${failure.message}`}>
                    <span className="font-bold text-ds-text">
                      {failure.row ? `Row ${failure.row}` : 'Import'}:
                    </span>{' '}
                    <span className="text-ds-text-2">{failure.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-ds-text-2" role="status">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Saved {progress?.done ?? 0} of {progress?.total ?? 0} rows. Keep this page open.
          </p>
        )}
      </Modal>
    </>
  );
}
