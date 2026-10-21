'use client';

import { Button } from '@aahar/ui';
import { Download, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ApiList, ApiResponse } from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage } from '@/lib/api';
import { downloadCsv, parseCsv } from '@/lib/csv';

export interface CsvColumn<T> {
  header: string;
  /** For people reading the export (a name beside a code); an import neither needs nor uses it. */
  readOnly?: boolean;
  value: (row: T) => number | string | null | undefined;
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
 * filters; Import reads the same columns back, so an edited export is the import template.
 * Rows are saved one at a time through the normal API, so every check and permission a form
 * has applies, and a bad row is reported without stopping the rest.
 */
export function CsvImportExport<T>({
  columns,
  exportRows,
  filename,
  noun,
  onImported,
  startImport,
}: Readonly<{
  columns: Array<CsvColumn<T>>;
  exportRows: () => Promise<T[]>;
  /** File name without the date or extension, e.g. "items". */
  filename: string;
  /** Plural, lower case, e.g. "items". */
  noun: string;
  onImported: () => void;
  /** Loads what the rows refer to, once per import; omit to hide Import. */
  startImport?: () => Promise<CsvRowImporter>;
}>) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
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

    const [header = [], ...rows] = parseCsv(await file.text());
    const positions = new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));
    const missing = columns
      .filter((column) => !column.readOnly)
      .map((column) => column.header)
      .filter((name) => !positions.has(name.toLowerCase()));

    if (rows.length === 0 || missing.length > 0) {
      showToast({
        description:
          missing.length > 0
            ? `Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Export first and edit that file.`
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
            onClick={() => fileRef.current?.click()}
            title={`Add or update ${noun} from a CSV file`}
            type="button"
            variant="outline"
          >
            <Upload aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            Import
          </Button>
          <input
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              // Cleared so choosing the same file again still imports it.
              event.target.value = '';

              if (file) {
                void runImport(file);
              }
            }}
            ref={fileRef}
            type="file"
          />
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
