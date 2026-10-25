'use client';

import type { ReportColumn, ReportQuery, ReportRow } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Play } from 'lucide-react';
import { useState } from 'react';
import { AppPageHeader, tableStyles } from '@/components/design-system';
import { useHospitals, useRestaurants } from '@/components/inventory/shared/utils';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, reportsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { downloadReportExcel } from '@/lib/report-excel';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

/** The screen shows this many rows; the Excel download has them all. */
const PREVIEW_ROWS = 300;

const amount = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** A datetime-local value ("2026-10-24T09:30") for a moment, in this browser's time. */
function localValue(value: Date) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function show(value: number | string | null | undefined, column: ReportColumn) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number') return value;

  return column.kind === 'money' ? amount.format(value) : quantity.format(value);
}

function ReportTable({
  columns,
  rows,
  totals,
}: Readonly<{ columns: ReportColumn[]; rows: ReportRow[]; totals: ReportRow | null }>) {
  const groups = columns.some((column) => column.group)
    ? columns.reduce<Array<{ label: string; span: number }>>((list, column) => {
        const last = list.at(-1);
        if (last && last.label === (column.group ?? '')) last.span += 1;
        else list.push({ label: column.group ?? '', span: 1 });
        return list;
      }, [])
    : null;
  const numeric = (column: ReportColumn) => column.kind === 'money' || column.kind === 'number';

  return (
    <div className="overflow-x-auto">
      <table className={cn(tableStyles.table, 'whitespace-nowrap text-[12.5px]')}>
        <thead className={tableStyles.head}>
          {groups ? (
            <tr>
              {groups.map((group, index) => (
                <th
                  className={cn(
                    tableStyles.th,
                    'border-b border-ds-divider text-center',
                    group.label && 'bg-ds-subtle text-ds-text',
                  )}
                  colSpan={group.span}
                  key={`${group.label}-${index}`}
                >
                  {group.label}
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            {columns.map((column) => (
              <th className={cn(tableStyles.th, numeric(column) && 'text-right')} key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
            <tr className="border-t border-ds-divider" key={index}>
              {columns.map((column) => (
                <td
                  className={cn(
                    'px-4 py-2',
                    numeric(column) ? 'text-right font-mono tabular-nums' : 'text-ds-text-2',
                  )}
                  key={column.key}
                >
                  {show(row[column.key], column)}
                </td>
              ))}
            </tr>
          ))}
          {totals ? (
            <tr className="border-t-2 border-ds-border bg-ds-subtle font-semibold text-ds-text">
              {columns.map((column) => (
                <td
                  className={cn(
                    'px-4 py-2',
                    numeric(column) && 'text-right font-mono tabular-nums',
                  )}
                  key={column.key}
                >
                  {show(totals[column.key], column)}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The F&B reports, laid out as the old system's Excel exports (same titles and columns): pick
 * a report, a location, a date-time range and optionally a restaurant, see it, download it.
 */
export function ReportsPageClient() {
  const { showToast } = useToast();
  const { scopedHospitalId } = useLocationContext();
  const [code, setCode] = useUrlParam('report');
  const [pickedHospital, setPickedHospital] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [from, setFrom] = useState(() => localValue(startOfToday()));
  const [to, setTo] = useState(() => localValue(new Date()));
  const [query, setQuery] = useState<(ReportQuery & { code: string }) | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const hospitalId = scopedHospitalId ?? pickedHospital;
  const catalogQuery = useQuery({
    queryFn: async () => (await reportsApi.listReports()).data,
    queryKey: queryKeys.reports('catalog'),
    staleTime: Infinity,
  });
  const hospitalsQuery = useHospitals();
  const restaurantsQuery = useRestaurants(hospitalId || undefined);
  const catalog = catalogQuery.data ?? [];
  const report = catalog.find((entry) => entry.code === code) ?? catalog[0];
  const reportQuery = useQuery({
    enabled: query !== null,
    queryFn: async () => {
      const { code: reportCode, ...params } = query!;
      return (await reportsApi.runReport(reportCode, params)).data;
    },
    queryKey: queryKeys.reports(query),
  });
  const result = reportQuery.data;
  const problem = !report
    ? null
    : !hospitalId
      ? 'Choose a location.'
      : !from || !to || new Date(from) >= new Date(to)
        ? 'The report has to end after it starts.'
        : null;

  function run() {
    if (!report || problem) return;
    setQuery({
      code: report.code,
      from: new Date(from).toISOString(),
      hospitalId,
      restaurantIds: restaurantId || undefined,
      to: new Date(to).toISOString(),
    });
  }

  async function download() {
    if (!result) return;
    setIsDownloading(true);
    try {
      await downloadReportExcel(result);
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'The Excel file was not made',
        variant: 'error',
      });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="Sales, item-wise, tax, cancelled and complimentary reports, downloadable in the same Excel layout as before."
        title="Reports"
      />
      {/* The report types as tabs, one click apart (phones: the picker in the form); nothing runs
          until Show report. */}
      {catalog.length > 1 ? (
        <div
          aria-label="Report"
          className="hidden w-fit max-w-full flex-wrap gap-0.5 rounded-[26px] bg-ds-border/70 p-1 sm:flex"
          role="group"
        >
          {catalog.map((entry) => (
            <button
              aria-pressed={entry.code === report?.code}
              className={cn(
                'h-9 rounded-full px-4 text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                entry.code === report?.code
                  ? 'bg-ds-surface text-ds-text shadow-card'
                  : 'text-ds-text-2 hover:text-ds-text',
              )}
              key={entry.code}
              onClick={() => setCode(entry.code)}
              type="button"
            >
              {entry.title}
            </button>
          ))}
        </div>
      ) : null}
      <Panel className="p-4">
        {catalogQuery.isLoading ? (
          <Skeleton className="h-24" />
        ) : catalog.length === 0 ? (
          <p className="text-sm text-ds-muted">
            {catalogQuery.isError
              ? getApiErrorMessage(catalogQuery.error)
              : 'You have no reports to run. Ask an admin for report access.'}
          </p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2 xl:auto-cols-[minmax(0,1fr)] xl:grid-flow-col xl:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              run();
            }}
          >
            <div className="sm:hidden">
              <Field label="Report" name="report-code">
                <Select
                  id="report-code"
                  onChange={(event) => setCode(event.target.value)}
                  value={report?.code ?? ''}
                >
                  {catalog.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {scopedHospitalId ? null : (
              <Field label="Location" name="report-location">
                <Select
                  id="report-location"
                  onChange={(event) => {
                    setPickedHospital(event.target.value);
                    setRestaurantId('');
                  }}
                  value={pickedHospital}
                >
                  <option value="">Choose a location</option>
                  {(hospitalsQuery.data ?? []).map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.hospitalName}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Restaurant" name="report-restaurant">
              <Select
                disabled={!hospitalId}
                id="report-restaurant"
                onChange={(event) => setRestaurantId(event.target.value)}
                value={restaurantId}
              >
                <option value="">All restaurants</option>
                {(restaurantsQuery.data ?? []).map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.restaurantName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" name="report-from">
              <Input
                id="report-from"
                onChange={(event) => setFrom(event.target.value)}
                type="datetime-local"
                value={from}
              />
            </Field>
            <Field label="To" name="report-to">
              <Input
                id="report-to"
                onChange={(event) => setTo(event.target.value)}
                type="datetime-local"
                value={to}
              />
            </Field>
            <Button disabled={Boolean(problem) || reportQuery.isFetching} type="submit">
              {reportQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Show report
            </Button>
          </form>
        )}
        {report ? <p className="mt-3 text-sm text-ds-muted">{report.description}</p> : null}
        {problem && catalog.length ? (
          <p className="mt-1 text-sm text-ds-status-pending-fg">{problem}</p>
        ) : null}
      </Panel>

      {reportQuery.isError ? (
        <Panel className="p-4 text-sm text-ds-status-bad-fg" role="alert">
          {getApiErrorMessage(reportQuery.error)}
        </Panel>
      ) : result ? (
        <Panel aria-label={result.title} className="overflow-hidden" role="region">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ds-divider p-4">
            <div className="min-w-0 space-y-0.5">
              <h2 className="flex items-center gap-2 text-base font-bold text-ds-text">
                <FileSpreadsheet className="h-5 w-5 text-ds-link" />
                {result.title}
              </h2>
              <p className="text-sm text-ds-text-2">{result.location}</p>
              <p className="text-xs text-ds-muted">
                {new Date(result.from).toLocaleString('en-IN')} –{' '}
                {new Date(result.to).toLocaleString('en-IN')} · {result.restaurants.join(', ')} ·{' '}
                {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
                {result.rows.length > PREVIEW_ROWS
                  ? ` (first ${PREVIEW_ROWS} shown; the download has all)`
                  : ''}
              </p>
            </div>
            <Button
              disabled={isDownloading || result.rows.length === 0}
              onClick={() => void download()}
              type="button"
              variant="outline"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download Excel
            </Button>
          </div>
          {result.rows.length === 0 ? (
            <p className="p-6 text-sm text-ds-muted">Nothing in this range.</p>
          ) : (
            <ReportTable columns={result.columns} rows={result.rows} totals={result.totals} />
          )}
        </Panel>
      ) : null}
    </section>
  );
}
