'use client';

import type { ImportResult } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/components/auth-provider';
import { tableStyles } from '@/components/design-system';
import type { ImportDefinition } from '@/components/import/import-definitions';
import { Badge, RequiredMark } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { readImportFile, tableToImportRows } from '@/lib/import-file';
import { cn } from '@/lib/utils';

type Busy = 'checking' | 'importing' | 'reading' | null;

interface Checked {
  fileName: string;
  result: ImportResult;
  rows: Array<Record<string, string>>;
}

const actions = {
  create: { label: 'New', variant: 'success' },
  skip: { label: 'No change', variant: 'neutral' },
  update: { label: 'Update', variant: 'info' },
} as const;

const plural = (count: number, noun: string) =>
  `${count.toLocaleString('en-IN')} ${noun}${count === 1 ? '' : 's'}`;

/**
 * An Import button and its side panel: choose an Excel or CSV file, see every row checked by the
 * server (a dry run that saves nothing), then import them all at once. The server saves every
 * row or none, so Import is offered only when no row has a problem.
 */
export function ImportButton({ definition }: Readonly<{ definition: ImportDefinition }>) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const { columns, noun } = definition;

  if (!hasPermission(definition.permissions)) {
    return null;
  }

  const problems = checked?.result.rows.filter((row) => row.errors.length > 0).length ?? 0;
  const changing = checked ? checked.result.created + checked.result.updated : 0;

  function close() {
    // An import under way finishes first; its result is what the panel shows next.
    if (busy === 'importing') {
      return;
    }

    setOpen(false);
    setBusy(null);
    setError(null);
    setChecked(null);
    setDone(null);
  }

  async function check(file: File) {
    setError(null);
    setChecked(null);
    setBusy('reading');

    try {
      const rows = tableToImportRows(await readImportFile(file), columns);

      setBusy('checking');
      const { data } = await definition.send({ dryRun: true, rows });

      setChecked({ fileName: file.name, result: data, rows });
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!checked) {
      return;
    }

    setError(null);
    setBusy('importing');

    try {
      const { data } = await definition.send({ dryRun: false, rows: checked.rows });

      if (data.imported) {
        setDone(data);
        definition.refresh(queryClient);
      } else {
        // Something changed since the check (another user, say): show the rows again.
        setChecked({ ...checked, result: data });
      }
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const present = checked
    ? columns.filter((column) => checked.rows.some((row) => column.field in row))
    : [];
  // Rows with problems first, so a long file's few bad rows aren't hidden below the rest.
  const order = checked
    ? checked.rows
        .map((row, index) => ({ index, row, status: checked.result.rows[index] }))
        .sort((a, b) => Number(!a.status?.errors.length) - Number(!b.status?.errors.length))
    : [];

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        title={`Add or update ${noun} from an Excel or CSV file`}
        type="button"
        variant="outline"
      >
        <Upload aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        Import
      </Button>

      {/* On the body: the page header the button sits in would otherwise clip the panel. */}
      {open
        ? createPortal(
            <Modal
              description={definition.matching}
              footer={
                done ? (
                  <div className="flex justify-end">
                    <Button onClick={close} type="button">
                      Done
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      disabled={busy === 'importing'}
                      onClick={close}
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!checked || problems > 0 || changing === 0 || busy !== null}
                      onClick={() => void runImport()}
                      type="button"
                    >
                      {busy === 'importing' ? (
                        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      ) : null}
                      {checked && changing > 0 ? `Import ${plural(changing, 'row')}` : 'Import'}
                    </Button>
                  </div>
                )
              }
              onClose={close}
              open={open}
              side
              title={`Import ${noun}`}
            >
              {done ? (
                <p className="text-sm text-ds-text" role="status">
                  <strong>{done.created}</strong> added, <strong>{done.updated}</strong> updated
                  {done.skipped ? (
                    <>
                      , <strong>{done.skipped}</strong> unchanged
                    </>
                  ) : null}
                  .
                </p>
              ) : (
                <div className="grid gap-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      disabled={busy !== null}
                      onClick={() => fileRef.current?.click()}
                      type="button"
                      variant={checked ? 'outline' : 'default'}
                    >
                      <FileSpreadsheet aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                      {checked ? 'Choose another file' : 'Choose file'}
                    </Button>
                    <Button
                      onClick={() =>
                        downloadCsv(`${definition.filename}.csv`, [
                          columns.map((column) => column.header),
                          columns.map((column) => column.example),
                        ])
                      }
                      type="button"
                      variant="ghost"
                    >
                      <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                      Download template
                    </Button>
                    <input
                      accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];

                        // Cleared so choosing the same file again, once fixed, checks it again.
                        event.target.value = '';

                        if (file) {
                          void check(file);
                        }
                      }}
                      ref={fileRef}
                      type="file"
                    />
                  </div>

                  {busy === 'reading' || busy === 'checking' ? (
                    <p className="flex items-center gap-2 text-ds-text-2" role="status">
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      {busy === 'reading' ? 'Reading the file…' : 'Checking every row…'}
                    </p>
                  ) : null}

                  {error ? (
                    <p
                      className="rounded-control bg-ds-status-bad-bg p-3 text-ds-status-bad-fg"
                      role="alert"
                    >
                      {error}
                    </p>
                  ) : null}

                  {checked ? (
                    <>
                      <p className="text-ds-text" role="status">
                        <span className="font-semibold">{checked.fileName}</span>:{' '}
                        {plural(checked.rows.length, 'row')}. {checked.result.created} new,{' '}
                        {checked.result.updated} to update, {checked.result.skipped} unchanged
                        {problems ? (
                          <>
                            ,{' '}
                            <strong className="text-ds-status-bad-fg">
                              {plural(problems, 'row')} to fix
                            </strong>
                            . Nothing is imported until every row is right.
                          </>
                        ) : (
                          '.'
                        )}
                      </p>
                      <div className="max-h-[60vh] overflow-auto rounded-control border border-ds-border">
                        <table className={cn(tableStyles.table, 'text-[13px]')}>
                          <thead className={tableStyles.head}>
                            <tr>
                              <th className="px-3 py-2 font-semibold">Row</th>
                              <th className="px-3 py-2 font-semibold">Result</th>
                              {present.map((column) => (
                                <th
                                  className="whitespace-nowrap px-3 py-2 font-semibold"
                                  key={column.field}
                                >
                                  {column.header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {order.map(({ index, row, status }) => (
                              <tr
                                className={cn(
                                  'border-t border-ds-divider align-top',
                                  status?.errors.length && 'bg-ds-status-bad-bg/40',
                                )}
                                key={index}
                              >
                                {/* Numbered as in the spreadsheet: the header is row 1. */}
                                <td className={cn('px-3 py-2', tableStyles.num)}>{index + 2}</td>
                                <td className="min-w-48 px-3 py-2">
                                  {status?.errors.length ? (
                                    <ul className="grid gap-0.5 text-ds-status-bad-fg">
                                      {status.errors.map((message) => (
                                        <li key={message}>{message}</li>
                                      ))}
                                    </ul>
                                  ) : status ? (
                                    <Badge variant={actions[status.action].variant}>
                                      {actions[status.action].label}
                                    </Badge>
                                  ) : null}
                                </td>
                                {present.map((column) => (
                                  <td
                                    className="whitespace-nowrap px-3 py-2 text-ds-text-2"
                                    key={column.field}
                                  >
                                    {row[column.field]}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : busy === null ? (
                    <div className="grid gap-2">
                      <p className="text-ds-text-2">
                        An Excel (.xlsx) or CSV file, up to 1,000 rows, with these columns in any
                        order:
                      </p>
                      <dl className="grid gap-2 rounded-control border border-ds-border p-3">
                        {columns.map((column) => (
                          <div key={column.field}>
                            <dt className="font-semibold text-ds-text">
                              {column.header}
                              {column.required ? <RequiredMark /> : null}
                            </dt>
                            {column.hint ? <dd className="text-ds-text-2">{column.hint}</dd> : null}
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                </div>
              )}
            </Modal>,
            document.body,
          )
        : null}
    </>
  );
}
