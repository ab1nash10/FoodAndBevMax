'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import type { Transfer } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, ListPager, StatusChip, tableStyles } from '@/components/design-system';
import {
  formatDateOnly,
  formatQuantity,
  listLimit,
  plural,
} from '@/components/inventory/shared/utils';
import { useLocationNames } from '@/components/inventory/use-locations';
import { ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { QueryState } from '@/components/location-empty-states';
import {
  CounterPicker,
  formatDateTime,
  NoCounter,
  usePosCounter,
} from '@/components/point-of-sale/shared';
import { useToast } from '@/components/toast-provider';
import { Input, Panel } from '@/components/ui';
import { Modal, SegmentedControl } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateTransferQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { useUrlNumberParam, useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

type ReceiveView = 'ACKNOWLEDGED' | 'PENDING_ACKNOWLEDGEMENT';

/** Transfers sent to this counter: the ones waiting to be checked in, and those already in. */
export function ReceiveInventoryPageClient() {
  const { hasPermission } = useAuth();
  const locationName = useLocationNames(hasPermission);
  const { counter, counters, query: countersQuery, setCounterId } = usePosCounter();
  const [view, setView] = useUrlParam<ReceiveView>('view', 'PENDING_ACKNOWLEDGEMENT', [
    'ACKNOWLEDGED',
    'PENDING_ACKNOWLEDGEMENT',
  ]);
  const [page, setPage] = useUrlNumberParam('page');
  const [receiving, setReceiving] = useState<Transfer | null>(null);
  const [viewing, setViewing] = useState<Transfer | null>(null);
  const canReceive = hasPermission(['COUNTER_STOCK_RECEIVE', 'TRANSFER_ACKNOWLEDGE']);
  const counterId = counter?.id;

  const transfersQuery = useQuery({
    enabled: Boolean(counterId),
    queryFn: async () =>
      (
        await organizationApi.listTransfers({
          destinationId: counterId,
          destinationType: 'COUNTER',
          limit: listLimit,
          page,
          sortBy: 'transferDate',
          sortOrder: view === 'PENDING_ACKNOWLEDGEMENT' ? 'asc' : 'desc',
          status: view,
        })
      ).data,
    queryKey: queryKeys.transfers('counter', counterId, view, page),
  });
  const items = transfersQuery.data?.items ?? [];
  const meta = transfersQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <CounterPicker
            counter={counter}
            counters={counters}
            onChange={(id) => {
              setCounterId(id);
              setPage(1);
            }}
          />
        }
        count={transfersQuery.data?.meta.total}
        description="Check in stock sent to this counter. Accepted quantities become counter stock; the rest goes back."
        title="Receive Inventory"
      />
      {counter ? (
        <Panel aria-label="Transfers to this counter" className="overflow-hidden" role="region">
          <ListToolbar>
            <SegmentedControl<ReceiveView>
              label="Show"
              onChange={(value) => {
                setView(value);
                setPage(1);
              }}
              options={[
                { label: 'Waiting', value: 'PENDING_ACKNOWLEDGEMENT' },
                { label: 'Received', value: 'ACKNOWLEDGED' },
              ]}
              value={view}
            />
            <RefreshButton onClick={() => void transfersQuery.refetch()} />
          </ListToolbar>
          <div className="overflow-x-auto">
            <table className={cn(tableStyles.table, 'min-w-200 table-fixed')}>
              <thead className={tableStyles.head}>
                <tr>
                  <th className={cn(tableStyles.th, 'w-[16%]')}>Reference no</th>
                  <th className={cn(tableStyles.th, 'w-[16%]')}>From</th>
                  <th className={cn(tableStyles.th, 'w-[22%]')}>Status</th>
                  <th className={cn(tableStyles.th, 'w-[14%]')}>Distributed by</th>
                  <th className={cn(tableStyles.th, 'w-[14%]')}>Distributed at</th>
                  <th className={cn(tableStyles.th, 'w-[18%]')} />
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? (
                  items.map((transfer) => (
                    <tr className="border-t border-ds-divider" key={transfer.id}>
                      <td className={tableStyles.td}>
                        <p className={cn('truncate font-mono', tableStyles.title)}>
                          {transfer.transferNumber}
                        </p>
                        <p className="truncate text-[12px] text-ds-muted">
                          {plural(transfer.lines.length, 'line')}
                        </p>
                      </td>
                      <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                        {locationName(transfer.sourceType, transfer.sourceId)}
                      </td>
                      <td className={tableStyles.td}>
                        {transfer.status === 'ACKNOWLEDGED' ? (
                          <span className="text-[12.5px] font-medium text-ds-status-ok-fg italic">
                            Acknowledged at{' '}
                            {formatDateTime(transfer.acknowledgedAt ?? transfer.updatedAt)}
                          </span>
                        ) : transfer.status === 'PENDING_ACKNOWLEDGEMENT' ? (
                          <span className="text-[12.5px] text-ds-status-pending-fg">
                            Waiting since {formatDateTime(transfer.transferDate)}
                          </span>
                        ) : (
                          <StatusChip status={transfer.status} />
                        )}
                      </td>
                      <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                        {transfer.createdByName ?? '—'}
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-3')}>
                        {formatDateTime(transfer.transferDate)}
                      </td>
                      <td className={cn(tableStyles.td, 'text-right')}>
                        <span className="flex justify-end gap-2">
                          <Button
                            onClick={() => setViewing(transfer)}
                            type="button"
                            variant="outline"
                          >
                            View items
                          </Button>
                          {transfer.status === 'PENDING_ACKNOWLEDGEMENT' && canReceive ? (
                            <Button onClick={() => setReceiving(transfer)} type="button">
                              Receive
                            </Button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <QueryState
                    atLocation={false}
                    colSpan={6}
                    error={transfersQuery.error}
                    hint={
                      view === 'PENDING_ACKNOWLEDGEMENT'
                        ? 'Nothing is on its way. Stock is sent to a counter from Inventory → Transfers.'
                        : 'Transfers this counter has checked in show here.'
                    }
                    isError={transfersQuery.isError}
                    isLoading={transfersQuery.isLoading}
                    label={
                      view === 'PENDING_ACKNOWLEDGEMENT'
                        ? 'transfers waiting'
                        : 'received transfers'
                    }
                  />
                )}
              </tbody>
            </table>
          </div>
          <ListPager
            limit={meta.limit}
            noun="transfer"
            onPageChange={setPage}
            page={meta.page}
            total={meta.total}
            totalPages={meta.totalPages}
          />
        </Panel>
      ) : (
        <NoCounter isLoading={countersQuery.isLoading} />
      )}
      <ReceivePanel onClose={() => setReceiving(null)} transfer={receiving} />
      <ItemsPanel onClose={() => setViewing(null)} transfer={viewing} />
    </section>
  );
}

/** Read-only: what a transfer carried, and how much of it was accepted. */
function ItemsPanel({
  onClose,
  transfer,
}: Readonly<{ onClose: () => void; transfer: Transfer | null }>) {
  const isReceived = transfer?.status === 'ACKNOWLEDGED';

  return (
    <Modal
      description={transfer ? `Distributed ${formatDateTime(transfer.transferDate)}` : undefined}
      onClose={onClose}
      open={transfer !== null}
      side
      title={transfer ? `Items in ${transfer.transferNumber}` : 'Items'}
    >
      <table className={cn(tableStyles.table, 'table-fixed')}>
        <thead className={tableStyles.head}>
          <tr>
            <th className={cn(tableStyles.th, 'w-[40%] px-2')}>Item</th>
            <th className={cn(tableStyles.th, 'w-[20%] px-2 text-right')}>Sent</th>
            <th className={cn(tableStyles.th, 'w-[20%] px-2 text-right')}>Accepted</th>
            <th className={cn(tableStyles.th, 'w-[20%] px-2 text-right')}>Rejected</th>
          </tr>
        </thead>
        <tbody>
          {(transfer?.lines ?? []).map((line) => (
            <tr className="border-t border-ds-divider" key={line.id}>
              <td className={cn(tableStyles.td, 'px-2')}>
                <p className={cn('truncate', tableStyles.title)}>{line.item.itemName}</p>
                <p className="truncate text-xs text-ds-muted">
                  <span className="font-mono">{line.batchNumber ?? 'No batch'}</span>
                  {line.expiryDate ? ` · exp ${formatDateOnly(line.expiryDate)}` : null}
                </p>
                {line.rejectionReason ? (
                  <p className="text-xs text-ds-status-bad-fg">{line.rejectionReason}</p>
                ) : null}
              </td>
              <td className={cn(tableStyles.td, tableStyles.num, 'px-2 text-right')}>
                {formatQuantity(line.sentQty)}
              </td>
              <td
                className={cn(
                  tableStyles.td,
                  tableStyles.num,
                  'px-2 text-right',
                  isReceived ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                )}
              >
                {isReceived ? formatQuantity(line.acceptedQty) : '—'}
              </td>
              <td
                className={cn(
                  tableStyles.td,
                  tableStyles.num,
                  'px-2 text-right',
                  line.rejectedQty > 0 ? 'text-ds-status-bad-fg' : 'text-ds-muted',
                )}
              >
                {isReceived ? formatQuantity(line.rejectedQty) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

/** Line by line: how much arrived in good order; the rest goes back with a reason. */
function ReceivePanel({
  onClose,
  transfer,
}: Readonly<{ onClose: () => void; transfer: Transfer | null }>) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // Typed values by line id; a line not typed in yet is accepted in full.
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Start fresh for each transfer opened.
  if (transfer && openFor !== transfer.id) {
    setOpenFor(transfer.id);
    setAccepted({});
    setReasons({});
    setTriedSubmit(false);
  }

  const rows = (transfer?.lines ?? []).map((line) => {
    const raw = accepted[line.id] ?? String(line.sentQty);
    const value = Number(raw);
    const isValid = raw.trim() !== '' && value >= 0 && value <= line.sentQty + 0.0005;
    const acceptedQty = isValid ? Math.min(value, line.sentQty) : 0;
    const rejectedQty = Number((line.sentQty - acceptedQty).toFixed(3));
    const reason = (reasons[line.id] ?? '').trim();

    return {
      acceptedQty,
      error: !isValid
        ? `Accept between 0 and ${formatQuantity(line.sentQty)}.`
        : rejectedQty > 0 && !reason
          ? 'Say why the rest is sent back.'
          : null,
      isValid,
      line,
      raw,
      reason,
      rejectedQty,
    };
  });

  const receive = useMutation({
    mutationFn: () =>
      organizationApi.createTransferAcknowledgement({
        items: rows.map((row) => ({
          acceptedQty: row.acceptedQty,
          batchNumber: row.line.batchNumber ?? undefined,
          expiryDate: row.line.expiryDate ?? undefined,
          itemId: row.line.itemId,
          rejectedQty: row.rejectedQty,
          rejectionReason: row.rejectedQty > 0 ? row.reason : undefined,
          sentQty: row.line.sentQty,
          transferLineId: row.line.id,
        })),
        transferId: transfer!.id,
      }),
    onError: (error) =>
      showToast({
        description: getApiErrorMessage(error),
        title: 'Stock was not received',
        variant: 'error',
      }),
    onSuccess: () => {
      invalidateTransferQueries(queryClient);
      showToast({
        description: `${transfer!.transferNumber} is now counter stock.`,
        title: 'Stock received',
        variant: 'success',
      });
      onClose();
    },
  });

  function submit() {
    setTriedSubmit(true);

    if (rows.every((row) => !row.error)) {
      receive.mutate();
    }
  }

  return (
    <Modal
      description={transfer ? `Sent ${formatDateTime(transfer.transferDate)}` : undefined}
      footer={
        <div className="flex flex-wrap gap-3">
          <Button disabled={receive.isPending} onClick={submit} type="button">
            {receive.isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck aria-hidden="true" className="h-4 w-4" />
            )}
            Receive stock
          </Button>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
        </div>
      }
      onClose={onClose}
      open={transfer !== null}
      side
      title={transfer ? `Receive ${transfer.transferNumber}` : 'Receive'}
    >
      <ul className="divide-y divide-ds-divider">
        {rows.map((row) => (
          <li className="space-y-2.5 py-3.5" key={row.line.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ds-text">
                  {row.line.item.itemName}
                </p>
                <p className="truncate text-xs text-ds-muted">
                  <span className="font-mono">
                    {row.line.batchNumber ?? row.line.item.itemCode}
                  </span>
                  {row.line.expiryDate ? ` · exp ${formatDateOnly(row.line.expiryDate)}` : null}
                </p>
              </div>
              <span className="shrink-0 text-right text-xs text-ds-muted">
                Sent
                <span className="block font-mono text-sm font-semibold text-ds-text">
                  {formatQuantity(row.line.sentQty)}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ds-text-2">
                Accepted
                <Input
                  aria-invalid={triedSubmit && !row.isValid ? true : undefined}
                  inputMode="decimal"
                  max={row.line.sentQty}
                  min={0}
                  onChange={(event) =>
                    setAccepted((current) => ({ ...current, [row.line.id]: event.target.value }))
                  }
                  step="any"
                  type="number"
                  value={row.raw}
                />
              </label>
              <span className="flex flex-col gap-1 text-xs font-semibold text-ds-text-2">
                Rejected
                <span
                  className={cn(
                    'flex h-control items-center font-mono text-sm',
                    row.rejectedQty > 0 ? 'font-semibold text-ds-status-bad-fg' : 'text-ds-muted',
                  )}
                >
                  {formatQuantity(row.rejectedQty)}
                </span>
              </span>
            </div>
            {row.rejectedQty > 0 ? (
              <Input
                aria-label={`Why ${row.line.item.itemName} is sent back`}
                maxLength={200}
                onChange={(event) =>
                  setReasons((current) => ({ ...current, [row.line.id]: event.target.value }))
                }
                placeholder="Why is the rest sent back? e.g. Damaged in transit"
                value={reasons[row.line.id] ?? ''}
              />
            ) : null}
            {triedSubmit && row.error ? (
              <p className="text-xs font-semibold text-ds-status-bad-fg" role="alert">
                {row.error}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
