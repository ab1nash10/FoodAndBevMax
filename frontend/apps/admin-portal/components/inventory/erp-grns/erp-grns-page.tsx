'use client';

import {
  GRN_CLOSE_REASONS,
  type GrnCloseReason,
  type GrnEntry,
  type GrnEntryQuery,
  type GrnEntryRow,
  type GrnEntryStatus,
} from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileInput, Loader2, Pause, Play, RotateCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  AppPageHeader,
  DateTimeCell,
  EmptyState,
  ListPager,
  TableSkeletonRows,
  tableStyles,
} from '@/components/design-system';
import { SearchInput } from '@/components/inventory/shared/components';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Input, Panel, Select } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, grnEntriesApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const STATUSES: GrnEntryStatus[] = ['PENDING', 'VERIFIED', 'CLOSED'];
// A GRN the ERP sends shows up on an open list within this.
const REFRESH_MS = 15_000;
const statusShown: Record<
  GrnEntryStatus,
  { label: string; tone: 'neutral' | 'success' | 'warning' }
> = {
  CLOSED: { label: 'Closed', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'warning' },
  VERIFIED: { label: 'Success', tone: 'success' },
};

const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const show = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === ''
    ? '—'
    : typeof value === 'number'
      ? numberFormat.format(value)
      : value;
const dateOnly = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
const indiaDateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

/** What the ERP sent: goods in, a reverse (return to vendor), or both in one GRN. */
function kindOf(grn: GrnEntry) {
  const flags = new Set(grn.rows.map((row) => row.flag));
  return flags.size > 1 ? 'GRN + reverse' : flags.has(1) ? 'GRN reverse' : 'GRN';
}

/**
 * GRNs the ERP sent (POST /erp/grns), one row per batch in the ERP's own fields. Goods in go
 * into the location's Main Store on arrival; a reverse takes what the store holds and waits for
 * the rest, and the store can run it now, pause its automatic rerun, or close it with a reason.
 */
export function ErpGrnsPageClient({ log = false }: Readonly<{ log?: boolean }> = {}) {
  const { hasPermission } = useAuth();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [status, setStatus] = useUrlParam<'' | GrnEntryStatus>('view', '', STATUSES);
  const [page, setPage] = useUrlNumberParam('page');
  const [openGrn, setOpenGrn] = useUrlParam('grn');
  const [receivedFrom, setReceivedFrom] = useUrlParam('from');
  const [receivedTo, setReceivedTo] = useUrlParam('to');
  const [limit, setLimit] = useState(25);
  const filters: GrnEntryQuery = {
    hospitalId: scopedHospitalId,
    limit,
    page,
    receivedFrom: receivedFrom || undefined,
    receivedTo: receivedTo || undefined,
    search: search || undefined,
    status: status || undefined,
  };
  const query = useQuery({
    enabled: !isLoadingLocations,
    queryFn: async () => (await grnEntriesApi.listGrnEntries(filters)).data,
    queryKey: queryKeys.grnEntries('list', filters),
    // The ERP sends GRNs at any time: the open list picks them up by itself (paused while the
    // tab is in the background).
    refetchInterval: REFRESH_MS,
  });
  const grns = query.data?.items ?? [];
  const listed = grns.find((grn) => grn.grn_No === openGrn);
  // A link (dashboard, ledger, search) names a GRN that may be on another page of the list.
  const linked = useQuery({
    enabled: query.isSuccess && Boolean(openGrn) && !listed,
    queryFn: async () =>
      (
        await grnEntriesApi.listGrnEntries({ hospitalId: scopedHospitalId, search: openGrn })
      ).data.items.find((grn) => grn.grn_No === openGrn) ?? null,
    queryKey: queryKeys.grnEntries('one', scopedHospitalId ?? 'all', openGrn),
  });
  const opened = listed ?? linked.data ?? undefined;
  const activeFilters = [status, search, receivedFrom, receivedTo].filter(Boolean).length;

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => setPage(1));

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="GRNs the ERP sent. Goods in go into the location's Main Store as they arrive; a reverse takes what the store holds, and the rest stays owed (Pending) until the batch comes back. A GRN F&B cannot take is on ERP GRN errors."
        eyebrow={log ? 'Logs' : 'Inventory'}
        title={log ? 'ERP GRN log' : 'ERP GRNs'}
      />

      <Panel aria-label="GRNs from the ERP" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search ERP GRNs"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="GRN or transaction number"
            value={searchInput}
          />
          <FiltersMenu activeCount={[status, receivedFrom, receivedTo].filter(Boolean).length}>
            <FilterField label="Status">
              <Select
                onChange={(event) => {
                  setStatus(event.target.value as '' | GrnEntryStatus);
                  setPage(1);
                }}
                value={status}
              >
                <option value="">All statuses</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {statusShown[value].label}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Received from">
              <Input
                max={receivedTo || undefined}
                onChange={(event) => {
                  setReceivedFrom(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={receivedFrom}
              />
            </FilterField>
            <FilterField label="Received to">
              <Input
                min={receivedFrom || undefined}
                onChange={(event) => {
                  setReceivedTo(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={receivedTo}
              />
            </FilterField>
          </FiltersMenu>
          <RefreshButton onClick={() => void query.refetch()} />
          <ClearFiltersButton
            active={activeFilters > 0}
            onClear={() => {
              setSearch('');
              setStatus('');
              setReceivedFrom('');
              setReceivedTo('');
              setPage(1);
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={tableStyles.th}>GRN No</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden)}>Location</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden)}>Supplier</th>
                <th className={cn(tableStyles.th, 'w-[110px] text-right')}>Qty</th>
                <th className={cn(tableStyles.th, 'w-[120px]')}>Status</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[132px]')}>
                  Received
                </th>
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <TableSkeletonRows
                  cells={[
                    tableStyles.phoneHidden,
                    tableStyles.phoneHidden,
                    undefined,
                    undefined,
                    tableStyles.phoneHidden,
                  ]}
                />
              ) : query.isError ? (
                <tr>
                  <td className="p-6 text-sm text-ds-status-bad-fg" colSpan={6} role="alert">
                    {getApiErrorMessage(query.error)}
                  </td>
                </tr>
              ) : grns.length === 0 ? (
                <tr>
                  <td className="p-4" colSpan={6}>
                    <EmptyState
                      description={
                        activeFilters
                          ? 'Try other filters.'
                          : 'Each GRN the ERP sends is listed here as it arrives.'
                      }
                      icon={FileInput}
                      title="No GRNs from the ERP"
                    />
                  </td>
                </tr>
              ) : (
                grns.map((grn) => {
                  const first = grn.rows[0];
                  const shown = statusShown[grn.status];

                  return (
                    <tr className={tableStyles.row} data-record-id={grn.grn_No} key={grn.grn_No}>
                      <td className={tableStyles.td}>
                        <button
                          className="block max-w-full truncate text-left font-semibold text-ds-text hover:underline"
                          onClick={() => setOpenGrn(grn.grn_No)}
                          type="button"
                        >
                          {grn.grn_No}
                        </button>
                        <span className="block text-[12px] text-ds-muted">
                          {grn.rows.length} {grn.rows.length === 1 ? 'batch' : 'batches'} ·{' '}
                          {kindOf(grn)}
                        </span>
                        <span
                          className={cn(
                            'block truncate text-[11.5px] text-ds-muted',
                            tableStyles.code,
                          )}
                          title={`Transaction ${grn.transaction_number}`}
                        >
                          {grn.transaction_number.slice(0, 8)}
                        </span>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <span className="block truncate">{grn.location_name}</span>
                        <span className="block truncate text-[12px] text-ds-muted">
                          {grn.store_name}
                        </span>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <span className={cn('block truncate', tableStyles.code)}>
                          {show(first?.supplier)}
                        </span>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                        {show(grn.totals.transaction_qty)}
                        {grn.totals.pending_qty > 0 ? (
                          <span className="block text-[12px] text-ds-status-pending-fg">
                            {show(grn.totals.pending_qty)} waiting
                          </span>
                        ) : null}
                      </td>
                      <td className={tableStyles.td}>
                        <Badge className="normal-case" variant={shown.tone}>
                          {shown.label}
                        </Badge>
                        {grn.status === 'PENDING' ? (
                          <span className="mt-1 block text-[12px] text-ds-muted">
                            {grn.rerun_active ? 'Rerun on' : 'Rerun paused'}
                          </span>
                        ) : null}
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <DateTimeCell value={grn.received_at} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {query.data ? (
          <ListPager
            limit={limit}
            noun="GRNs"
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
            onPageChange={setPage}
            page={page}
            total={query.data.meta.total}
            totalPages={Math.max(1, query.data.meta.totalPages)}
          />
        ) : null}
      </Panel>

      {opened ? (
        <ErpGrnPanel
          canManage={hasPermission('GRN_POST')}
          grn={opened}
          key={opened.grn_No}
          onClose={() => setOpenGrn('')}
        />
      ) : null}
    </section>
  );
}

/** One GRN in full: its details, each batch with what moved, and a waiting reverse's actions. */
function ErpGrnPanel({
  canManage,
  grn,
  onClose,
}: Readonly<{ canManage: boolean; grn: GrnEntry; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const first = grn.rows[0]!;
  const waiting = grn.status === 'PENDING';
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState<'' | GrnCloseReason>('');
  const [note, setNote] = useState('');
  // Other says nothing by itself: it needs the note.
  const canClose = reason !== '' && (reason !== 'OTHER' || note.trim() !== '');
  const action = useMutation({
    mutationFn: async (
      act:
        | { kind: 'close'; note?: string; reason: GrnCloseReason }
        | { kind: 'rerun'; active: boolean }
        | { kind: 'run' },
    ) =>
      (act.kind === 'run'
        ? await grnEntriesApi.runGrnEntry(grn.grn_No)
        : act.kind === 'rerun'
          ? await grnEntriesApi.setGrnEntryRerun(grn.grn_No, act.active)
          : await grnEntriesApi.closeGrnEntry(grn.grn_No, act.reason, act.note)
      ).data,
    onError: (error) =>
      showToast({
        description: getApiErrorMessage(error),
        title: 'That did not work',
        variant: 'error',
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.grnEntries() }),
    onSuccess: (after, act) => {
      const finished = after.status !== 'PENDING';
      const title =
        act.kind === 'close'
          ? `GRN ${grn.grn_No} closed`
          : finished
            ? `GRN ${grn.grn_No} is done`
            : act.kind === 'run'
              ? `${show(after.totals.pending_qty)} still waiting for stock`
              : act.active
                ? 'Automatic rerun resumed'
                : 'Automatic rerun paused';
      showToast({ title, variant: 'success' });
      setClosing(false);
    },
  });

  const details: Array<[string, string]> = [
    ['Transaction No', grn.transaction_number],
    ['Location', `${grn.location_name} (${grn.location})`],
    ['Store', grn.store_name],
    ['Date', indiaDateTime(first.date)],
    ['Supplier', show(first.supplier)],
    ['PO No', show(first.purchase_order)],
    ['Requisition No', show(first.requisition)],
    ['Issued by', show(first.issued_by)],
    [
      grn.status === 'CLOSED' ? 'Closed' : 'Finished',
      grn.verified_at
        ? `${indiaDateTime(grn.verified_at)}${grn.verified_by ? ` by ${grn.verified_by.name}` : ''}`
        : 'Not yet',
    ],
  ];

  return (
    <Modal
      description={`${grn.rows.length} ${grn.rows.length === 1 ? 'batch' : 'batches'} · ${kindOf(grn)} · ${show(grn.totals.transaction_qty)} units`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {waiting && canManage ? (
            <>
              <Button
                disabled={action.isPending}
                onClick={() => setClosing(true)}
                type="button"
                variant="outline"
              >
                <XCircle aria-hidden="true" className="h-4 w-4" />
                Close reverse
              </Button>
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate({ active: !grn.rerun_active, kind: 'rerun' })}
                type="button"
                variant="outline"
              >
                {grn.rerun_active ? (
                  <Pause aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Play aria-hidden="true" className="h-4 w-4" />
                )}
                {grn.rerun_active ? 'Pause automatic rerun' : 'Resume automatic rerun'}
              </Button>
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate({ kind: 'run' })}
                type="button"
              >
                {action.isPending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw aria-hidden="true" className="h-4 w-4" />
                )}
                Run now
              </Button>
            </>
          ) : null}
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
        </div>
      }
      meta={
        <Badge className="normal-case" variant={statusShown[grn.status].tone}>
          {statusShown[grn.status].label}
        </Badge>
      }
      onClose={onClose}
      open
      title={`GRN ${grn.grn_No}`}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
        {details.map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-[11.5px] text-ds-muted">{label}</dt>
            <dd className="truncate font-medium text-ds-text" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {waiting ? (
        <div className="mt-4 rounded-xl bg-ds-status-pending-bg px-3 py-2 text-[13px] text-ds-status-pending-fg">
          <p>
            {grn.rerun_active
              ? `${show(grn.totals.pending_qty)} still owed to the vendor. It runs again by itself whenever the batch reaches the Main Store.`
              : `${show(grn.totals.pending_qty)} still owed to the vendor. Automatic rerun is paused: run it now, or resume it.`}
          </p>
          <ul aria-label="How it gets settled" className="mt-1 list-disc pl-5">
            <li>A restaurant or counter that has the batch returns it to the Main Store.</li>
            <li>
              If the ERP returned more than the vendor got, the ERP sends a goods in (flag 0) of the
              difference.
            </li>
            <li>If it was sold, used or wasted, close it with a reason.</li>
          </ul>
          <p className="mt-1">
            Until then the batch cannot be sold at this location&apos;s counters.
          </p>
        </div>
      ) : null}

      <ul aria-label="Items" className="mt-4 space-y-4">
        {[...byItem(grn.rows)].map(([itemCode, rows]) => (
          <li data-item={itemCode} key={itemCode}>
            <h3 className="flex flex-wrap items-baseline gap-x-2 font-semibold text-ds-text">
              {show(rows[0]!.item_name)}
              <span className={tableStyles.code}>{itemCode}</span>
              <span className="text-[12px] font-normal text-ds-muted">
                {rows.length} {rows.length === 1 ? 'batch' : 'batches'}
              </span>
            </h3>
            <ul aria-label={`Batches of ${itemCode}`} className="mt-2 space-y-3">
              {rows.map((row) => (
                <BatchCard key={row.row_id} row={row} />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {closing ? (
        <form
          className="mt-4 grid gap-2 rounded-card border border-ds-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canClose && reason) {
              action.mutate({ kind: 'close', note: note.trim() || undefined, reason });
            }
          }}
        >
          <label className="text-[12.5px] text-ds-text-2" htmlFor="close-reason">
            Reason for closing
          </label>
          <p className="text-[12px] text-ds-muted">
            The {show(grn.totals.pending_qty)} still waiting are written off; the ERP sees the
            reason when it reads the GRN back.
          </p>
          <Select
            id="close-reason"
            onChange={(event) => setReason(event.target.value as '' | GrnCloseReason)}
            value={reason}
          >
            <option value="">Pick a reason</option>
            {Object.entries(GRN_CLOSE_REASONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <label className="text-[12.5px] text-ds-text-2" htmlFor="close-note">
            Note
          </label>
          <Input
            id="close-note"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              reason === 'OTHER' ? 'Say what happened' : 'Optional, e.g. sold at the café'
            }
            value={note}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setClosing(false)} type="button" variant="outline">
              Keep it waiting
            </Button>
            <Button disabled={!canClose || action.isPending} type="submit">
              Close it
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

/** One batch: what the ERP sent, and how much went into or out of the store. */
function BatchCard({ row }: Readonly<{ row: GrnEntryRow }>) {
  const fields: Array<[string, string]> = [
    ['Expiry', dateOnly(row.expiry_date)],
    ['HSN', show(row['HSN No'])],
    ['Unit rate', show(row['Unit Rate'])],
    ['MRP', show(row.MRP)],
    ['Tax rate', show(row['Tax Rate'])],
    ['Discount / extra', show(row['Discount/Extra Charges'])],
    ['Total value', show(row['Total Value'])],
  ];
  const moved: Array<[string, number, string?]> = [
    [row.flag === 1 ? 'Returned' : 'Added to the store', row.accepted_qty],
    ...(row.pending_qty > 0 ? [['Waiting', row.pending_qty] as [string, number]] : []),
    ...(row.rejected_qty > 0
      ? [
          ['Closed', row.rejected_qty, row.rejection_reason ?? undefined] as [
            string,
            number,
            string?,
          ],
        ]
      : []),
  ];

  return (
    <li
      aria-label={`Batch ${row.batch}`}
      className="rounded-card border border-ds-border p-3"
      data-row={row.row_id}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="min-w-0 font-semibold text-ds-text">
          <span className="text-[12px] font-normal text-ds-muted">Batch</span>{' '}
          <span className={tableStyles.code}>{row.batch}</span>
          {row.flag === 1 ? (
            <Badge className="ml-2 normal-case" variant="info">
              Return
            </Badge>
          ) : null}
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-[12px] text-ds-muted">
            {row.flag === 1 ? 'Qty to return' : 'Qty sent'}
          </span>
          <span className={cn(tableStyles.num, 'font-semibold')}>
            {show(row.transaction_qty)} {row.UOM ?? ''}
          </span>
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div className="flex min-w-0 gap-1.5" key={label}>
            <dt className="shrink-0 text-ds-muted">{label}</dt>
            <dd className="truncate text-ds-text" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-ds-border pt-2 text-[12.5px]">
        {moved.map(([label, value, why]) => (
          <div className="flex min-w-0 items-baseline gap-1.5" key={label}>
            <dt className="text-ds-muted">{label}</dt>
            <dd
              className={cn(
                tableStyles.num,
                'font-semibold',
                label === 'Waiting' ? 'text-ds-status-pending-fg' : 'text-ds-text',
              )}
            >
              {show(value)}
            </dd>
            {why ? <dd className="text-ds-text-2">{why}</dd> : null}
          </div>
        ))}
      </dl>
    </li>
  );
}

/** A GRN's rows grouped by item, in the order sent (the API sorts by item, then batch). */
function byItem(rows: GrnEntryRow[]) {
  const groups = new Map<string, GrnEntryRow[]>();
  for (const row of rows) {
    groups.set(row.part_item_code, [...(groups.get(row.part_item_code) ?? []), row]);
  }
  return groups;
}
