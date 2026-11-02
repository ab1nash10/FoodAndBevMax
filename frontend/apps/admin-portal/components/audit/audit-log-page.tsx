'use client';

import type { AuditLogQuery, AuditPage } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Download, Loader2, ScrollText } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  ActionChip,
  AuditChanges,
  auditActor,
  formatAuditTime,
} from '@/components/audit/history-drawer';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  AppPageHeader,
  DateTimeCell,
  EmptyState,
  TableSkeletonRows,
  tableStyles,
} from '@/components/design-system';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Input, Panel, Select } from '@/components/ui';
import { FilterSearch } from '@/components/ui-controls';
import { auditApi, getApiErrorMessage } from '@/lib/api';
import { auditCsvToReport, auditEntities, dayRange, entityLabel } from '@/lib/audit';
import { queryKeys } from '@/lib/query-keys';
import { downloadReportExcel } from '@/lib/report-excel';
import { useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

/**
 * Who changed what, newest first: filter by log type, action, day range and summary text
 * (the top-bar location scopes it), open a row for the fields it changed, export to Excel.
 */
export function AuditLogPageClient() {
  const { showToast } = useToast();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [actionInput, setAction, action] = useUrlSearchParam('action');
  const [entityName, setEntityName] = useUrlParam('type');
  const [from, setFrom] = useUrlParam('from');
  const [to, setTo] = useUrlParam('to');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [isExporting, setIsExporting] = useState(false);
  const filters: AuditLogQuery = {
    action: action.trim().toUpperCase().replace(/\s+/g, '_'),
    entityName,
    hospitalId: scopedHospitalId,
    q: search.trim(),
    ...dayRange(from, to),
  };
  const query = useInfiniteQuery({
    // The top-bar location decides the scope: wait for it rather than load everything first.
    enabled: !isLoadingLocations,
    getNextPageParam: (last: AuditPage) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await auditApi.listAuditLogs({ ...filters, cursor: pageParam })).data,
    queryKey: queryKeys.auditLogs('list', filters),
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const activeFilters = [entityName, action, from, to].filter(Boolean).length;
  const hasFilters = activeFilters > 0 || Boolean(search);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function exportExcel() {
    setIsExporting(true);
    try {
      // The server streams CSV (and records the export); the sheet is written here.
      await downloadReportExcel(auditCsvToReport(await auditApi.exportAuditLogs(filters)));
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'The Excel file was not exported',
        variant: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <Button
            disabled={isExporting || rows.length === 0}
            onClick={() => void exportExcel()}
            type="button"
            variant="outline"
          >
            {isExporting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="h-4 w-4" />
            )}
            Export Excel
          </Button>
        }
        description="Who changed what and when: deliveries, transfers, production, masters, users and sign-ins."
        eyebrow="Logs"
        title="Activity Logs"
      />
      <Panel aria-label="Audit log" className="overflow-hidden" role="region">
        <ListToolbar>
          <FilterSearch
            label="Search audit summaries"
            onChange={setSearch}
            placeholder="Search the summary, e.g. a GRN or item"
            value={searchInput}
          />
          <FiltersMenu activeCount={activeFilters}>
            <FilterField label="Log type">
              <Select onChange={(event) => setEntityName(event.target.value)} value={entityName}>
                <option value="">All log types</option>
                {auditEntities.map((entity) => (
                  <option key={entity.value} value={entity.value}>
                    {entity.label}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Action">
              <Input
                onChange={(event) => setAction(event.target.value)}
                placeholder="e.g. GRN_POST"
                value={actionInput}
              />
            </FilterField>
            <FilterField label="From">
              <Input
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                type="date"
                value={from}
              />
            </FilterField>
            <FilterField label="To">
              <Input
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                type="date"
                value={to}
              />
            </FilterField>
          </FiltersMenu>
          <RefreshButton onClick={() => void query.refetch()} />
          <ClearFiltersButton
            active={hasFilters}
            onClear={() => {
              setSearch('');
              setAction('');
              setEntityName('');
              setFrom('');
              setTo('');
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[132px]')}>Time</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[17%]')}>Who</th>
                <th className={cn(tableStyles.th, 'sm:w-[20%]')}>Action</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[15%]')}>Record</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden)}>Summary</th>
                <th className={cn(tableStyles.th, 'w-14')}>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <TableSkeletonRows
                  cells={[
                    tableStyles.phoneHidden,
                    undefined,
                    tableStyles.phoneHidden,
                    tableStyles.phoneHidden,
                    undefined,
                  ]}
                />
              ) : query.isError ? (
                <tr>
                  <td className="p-6 text-sm text-ds-status-bad-fg" colSpan={6} role="alert">
                    {getApiErrorMessage(query.error)}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="p-4" colSpan={6}>
                    <EmptyState
                      description={
                        hasFilters ? 'Try other filters or a wider date range.' : undefined
                      }
                      icon={ScrollText}
                      title="No audit entries"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isOpen = expanded.has(row.id);
                  const detailsId = `audit-${row.id}`;

                  return (
                    <Fragment key={row.id}>
                      <tr className="border-t border-ds-divider align-top">
                        <td className={tableStyles.td}>
                          <DateTimeCell
                            title={formatAuditTime(row.createdAt)}
                            value={row.createdAt}
                          />
                        </td>
                        <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                          <span className="block truncate font-semibold text-ds-text">
                            {auditActor(row)}
                          </span>
                          {row.actorRole ? (
                            <span className="block truncate text-[12px] text-ds-muted">
                              {row.actorRole}
                            </span>
                          ) : null}
                        </td>
                        <td className={tableStyles.td}>
                          <ActionChip action={row.action} />
                        </td>
                        <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                          <span className="block truncate text-[12px] text-ds-muted">
                            {entityLabel(row.entityName)}
                          </span>
                          {row.recordName ? (
                            <span
                              className="block truncate font-semibold text-ds-text"
                              title={row.recordName}
                            >
                              {row.recordName}
                            </span>
                          ) : (
                            <span
                              className={cn('block truncate', tableStyles.code)}
                              title={row.entityId}
                            >
                              {row.entityId}
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(tableStyles.td, tableStyles.phoneHidden, 'text-ds-text-2')}
                        >
                          <span className="line-clamp-2">{row.summary ?? '—'}</span>
                        </td>
                        <td className={cn(tableStyles.td, 'text-right')}>
                          <Button
                            aria-controls={isOpen ? detailsId : undefined}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Hide changes' : 'Show changes'}
                            onClick={() => toggle(row.id)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                'h-4 w-4 transition-transform duration-150',
                                isOpen && 'rotate-180',
                              )}
                            />
                          </Button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-ds-subtle-2" id={detailsId}>
                          <td className="px-4 pb-4 pt-1 sm:pl-6" colSpan={6}>
                            {/* Phones leave out these columns: they are here instead. */}
                            <p className="mb-2 text-[12.5px] text-ds-text-2 sm:hidden">
                              <span className="font-semibold text-ds-text">{auditActor(row)}</span>
                              {row.actorRole ? ` · ${row.actorRole}` : null} ·{' '}
                              {entityLabel(row.entityName)}
                              {row.recordName ? ` ${row.recordName}` : null}
                              {row.summary ? ` · ${row.summary}` : null}
                            </p>
                            <AuditChanges row={row} />
                            <p className="mt-3 wrap-break-word text-[11.5px] text-ds-muted">
                              {[
                                `Record ${row.entityId}`,
                                row.source ? `via ${row.source}` : null,
                                row.ipAddress ? `IP ${row.ipAddress}` : null,
                                row.requestId ? `request ${row.requestId}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {query.hasNextPage ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-divider px-4 py-3 sm:px-6">
            <span className="text-[12.5px] text-ds-muted">Showing the latest {rows.length}</span>
            <Button
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
              type="button"
              variant="outline"
            >
              {query.isFetchingNextPage ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : null}
              Load more
            </Button>
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
