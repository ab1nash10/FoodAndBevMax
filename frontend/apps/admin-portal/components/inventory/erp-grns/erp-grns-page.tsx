'use client';

import type {
  GrnEntry,
  GrnEntryQuery,
  GrnEntryRow,
  GrnEntryStatus,
  VerifyGrnEntryInput,
} from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, FileInput, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { useConfirm } from '@/components/confirm-provider';
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

const STATUSES: GrnEntryStatus[] = ['PENDING', 'VERIFIED'];
// A GRN the ERP sends shows up on an open list within this.
const REFRESH_MS = 15_000;
const statusShown: Record<GrnEntryStatus, { label: string; tone: 'success' | 'warning' }> = {
  PENDING: { label: 'To verify', tone: 'warning' },
  VERIFIED: { label: 'Verified', tone: 'success' },
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
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * GRNs the ERP sent (POST /erp/grns), one row per batch in the ERP's own fields. The store opens
 * one, accepts or rejects every row, and the accepted quantity goes into its Main Store's stock.
 */
export function ErpGrnsPageClient() {
  const { hasPermission } = useAuth();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [status, setStatus] = useUrlParam<'' | GrnEntryStatus>('view', '', STATUSES);
  const [page, setPage] = useUrlNumberParam('page');
  const [openGrn, setOpenGrn] = useUrlParam('grn');
  const [limit, setLimit] = useState(25);
  const filters: GrnEntryQuery = {
    hospitalId: scopedHospitalId,
    limit,
    page,
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
  const opened = grns.find((grn) => grn.grn_No === openGrn);
  const activeFilters = [status, search].filter(Boolean).length;

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => setPage(1));

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="Deliveries the ERP sent. Open one, accept or reject each batch, and what you accept goes into the location's Main Store."
        eyebrow="Inventory"
        title="ERP GRNs"
      />

      <Panel aria-label="GRNs from the ERP" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search ERP GRNs"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="GRN number"
            value={searchInput}
          />
          <FiltersMenu activeCount={status ? 1 : 0}>
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
          </FiltersMenu>
          <RefreshButton onClick={() => void query.refetch()} />
          <ClearFiltersButton
            active={activeFilters > 0}
            onClear={() => {
              setSearch('');
              setStatus('');
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
                          : 'Each GRN the ERP sends is listed here for the store to verify.'
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
                    <tr
                      className={tableStyles.row}
                      data-record-id={grn.grn_No}
                      key={grn.grn_No}
                      onClick={() => setOpenGrn(grn.grn_No)}
                    >
                      <td className={tableStyles.td}>
                        <button
                          className="block max-w-full truncate text-left font-semibold text-ds-text hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenGrn(grn.grn_No);
                          }}
                          type="button"
                        >
                          {grn.grn_No}
                        </button>
                        <span className="block text-[12px] text-ds-muted">
                          {grn.rows.length} {grn.rows.length === 1 ? 'batch' : 'batches'}
                          {grn.rows.some((row) => row.flag === 1) ? ' · Return' : ''}
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
                        {grn.totals.accepted_qty !== null ? (
                          <span className="block text-[12px] text-ds-muted">
                            {show(grn.totals.accepted_qty)} in
                          </span>
                        ) : null}
                      </td>
                      <td className={tableStyles.td}>
                        <Badge className="normal-case" variant={shown.tone}>
                          {shown.label}
                        </Badge>
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
          canVerify={hasPermission('GRN_POST')}
          grn={opened}
          key={opened.grn_No}
          onClose={() => setOpenGrn('')}
        />
      ) : null}
    </section>
  );
}

interface Answer {
  accepted: string;
  reason: string;
}

/** One GRN in full: its details, then each row with the store's answer (or the form for it). */
function ErpGrnPanel({
  canVerify,
  grn,
  onClose,
}: Readonly<{ canVerify: boolean; grn: GrnEntry; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const first = grn.rows[0]!;
  const pending = grn.status === 'PENDING';
  const editable = pending && canVerify;
  // Everything accepted to start with: the store changes only what it turns back.
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      grn.rows.map((row) => [
        row.transaction_number,
        { accepted: String(row.transaction_qty), reason: '' },
      ]),
    ),
  );
  const verify = useMutation({
    mutationFn: (input: VerifyGrnEntryInput) => grnEntriesApi.verifyGrnEntry(grn.grn_No, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.grnEntries() }),
  });

  const answerOf = (row: GrnEntryRow) => {
    const answer = answers[row.transaction_number]!;
    const accepted = Number(answer.accepted);
    const valid =
      answer.accepted.trim() !== '' &&
      Number.isFinite(accepted) &&
      accepted >= 0 &&
      accepted <= row.transaction_qty;
    const rejected = valid ? round3(row.transaction_qty - accepted) : null;
    const needsReason = rejected !== null && rejected > 0 && !answer.reason.trim();

    return { accepted, needsReason, rejected, valid };
  };
  const problems = grn.rows.filter((row) => {
    const answer = answerOf(row);
    return !answer.valid || answer.needsReason;
  }).length;

  async function submit() {
    const ok = await confirm({
      confirmLabel: 'Verify',
      description:
        'The accepted quantity goes into the Main Store (or out of it, for a return) and the ERP can read your answer. This cannot be undone.',
      icon: CheckCheck,
      title: `Verify GRN ${grn.grn_No}?`,
    });
    if (!ok) return;

    try {
      await verify.mutateAsync({
        batches: grn.rows.map((row) => {
          const { accepted, rejected } = answerOf(row);
          const reason = answers[row.transaction_number]!.reason.trim();

          return {
            acceptedQty: accepted,
            rejectedQty: rejected ?? 0,
            rejectionReason: rejected ? reason : undefined,
            transactionNumber: row.transaction_number,
          };
        }),
      });
      showToast({ title: `GRN ${grn.grn_No} verified`, variant: 'success' });
      onClose();
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'The GRN was not verified',
        variant: 'error',
      });
    }
  }

  const details: Array<[string, string]> = [
    ['Location', `${grn.location_name} (${grn.location})`],
    ['Store', grn.store_name],
    ['Date', new Date(first.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
    ['Supplier', show(first.supplier)],
    ['PO No', show(first.purchase_order)],
    ['Requisition No', show(first.requisition)],
    ['Issued by', show(first.issued_by)],
    [
      'Verified',
      grn.verified_at
        ? `${new Date(grn.verified_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}${grn.verified_by ? ` by ${grn.verified_by.name}` : ''}`
        : 'Not yet',
    ],
  ];

  return (
    <Modal
      description={`${grn.rows.length} ${grn.rows.length === 1 ? 'batch' : 'batches'}, ${show(grn.totals.transaction_qty)} units sent`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editable && problems > 0 ? (
            <span className="mr-auto text-[12.5px] text-ds-status-bad-fg">
              {problems} {problems === 1 ? 'batch needs' : 'batches need'} a fix
            </span>
          ) : null}
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
          {editable ? (
            <Button
              disabled={problems > 0 || verify.isPending}
              onClick={() => void submit()}
              type="button"
            >
              {verify.isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck aria-hidden="true" className="h-4 w-4" />
              )}
              Verify GRN
            </Button>
          ) : null}
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

      <ul aria-label="Batches" className="mt-4 space-y-3">
        {grn.rows.map((row) => {
          const answer = answerOf(row);
          const fields: Array<[string, string]> = [
            ['Transaction No', row.transaction_number],
            ['Batch', row.batch],
            ['Expiry', dateOnly(row.expiry_date)],
            ['HSN', show(row['HSN No'])],
            ['Unit rate', show(row['Unit Rate'])],
            ['MRP', show(row.MRP)],
            ['Tax rate', show(row['Tax Rate'])],
            ['Discount / extra', show(row['Discount/Extra Charges'])],
            ['Total value', show(row['Total Value'])],
          ];

          return (
            <li
              className="rounded-2xl border border-ds-border p-3"
              data-transaction={row.transaction_number}
              key={row.transaction_number}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="min-w-0 font-semibold text-ds-text">
                  {show(row.item_name)}{' '}
                  <span className={tableStyles.code}>{row.part_item_code}</span>
                  {row.flag === 1 ? (
                    <Badge className="ml-2 normal-case" variant="info">
                      Return
                    </Badge>
                  ) : null}
                </p>
                <p className={cn(tableStyles.num, 'font-semibold')}>
                  {show(row.transaction_qty)} {row.UOM ?? ''}
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

              {editable ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[120px_100px_minmax(0,1fr)] sm:items-end">
                  <label className="text-[12px] text-ds-muted">
                    Accepted
                    <Input
                      aria-invalid={!answer.valid}
                      aria-label={`Accepted for ${row.transaction_number}`}
                      inputMode="decimal"
                      max={row.transaction_qty}
                      min={0}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [row.transaction_number]: {
                            ...current[row.transaction_number]!,
                            accepted: event.target.value,
                          },
                        }))
                      }
                      step="any"
                      type="number"
                      value={answers[row.transaction_number]!.accepted}
                    />
                  </label>
                  <p className="text-[12px] text-ds-muted">
                    Rejected
                    <span className={cn(tableStyles.num, 'block py-2 text-[13.5px] text-ds-text')}>
                      {answer.rejected === null ? '—' : show(answer.rejected)}
                    </span>
                  </p>
                  <label className="text-[12px] text-ds-muted">
                    Reason for rejecting
                    <Input
                      aria-invalid={answer.needsReason}
                      aria-label={`Reason for ${row.transaction_number}`}
                      disabled={!answer.rejected}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [row.transaction_number]: {
                            ...current[row.transaction_number]!,
                            reason: event.target.value,
                          },
                        }))
                      }
                      placeholder={answer.rejected ? 'Needed' : ''}
                      value={answers[row.transaction_number]!.reason}
                    />
                  </label>
                </div>
              ) : !pending ? (
                <p className="mt-2 text-[12.5px] text-ds-text-2">
                  Accepted <b className={tableStyles.num}>{show(row.accepted_qty)}</b>, rejected{' '}
                  <b className={tableStyles.num}>{show(row.rejected_qty)}</b>
                  {row.rejection_reason ? ` (${row.rejection_reason})` : ''}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
