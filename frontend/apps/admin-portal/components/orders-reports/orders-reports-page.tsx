'use client';

import type { AmendableBill, OrderReportRow, PaymentMode } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Loader2, Plus, Printer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { AppPageHeader, ListPager, tableStyles } from '@/components/design-system';
import { ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { QueryState } from '@/components/location-empty-states';
import { formatMoney, printBill, todayInIndia } from '@/components/point-of-sale/shared';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Label, Panel, Select } from '@/components/ui';
import { FilterSearch, Modal, SavedViewTabs } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import {
  setUrlParams,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import {
  formatStepTime,
  historyOf,
  minutesLabel,
  orderTypeQuery,
  paymentLabel,
  paymentModeNames,
  type OrderType,
} from './shared';

type Tab = 'amendments' | 'complimentary' | 'orders';

const tabs: Array<{ label: string; value: Tab }> = [
  { label: 'Orders & Reports', value: 'orders' },
  { label: 'Complimentary Orders', value: 'complimentary' },
  { label: 'Order Amendments', value: 'amendments' },
];

const orderedAt = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Asia/Kolkata',
});

/** Orders & Reports: every counter bill, the complimentary ones, and amendments to bills. */
export function OrdersReportsPageClient() {
  const [tab, setTab] = useUrlParam<Tab>('tab', 'orders', [
    'amendments',
    'complimentary',
    'orders',
  ]);

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="Every bill raised at the counters: its steps, money and payment, the complimentary ones, and amendments made to bills."
        title="Orders & Reports"
      />
      <PaidNotBilled />
      <Panel className="overflow-hidden">
        <SavedViewTabs
          label="Orders and reports views"
          onChange={(next) => {
            setUrlParams({ page: null, q: null });
            setTab(next);
          }}
          value={tab}
          views={tabs}
        />
        {tab === 'amendments' ? (
          <AmendmentsTab />
        ) : (
          <OrdersTab complimentary={tab === 'complimentary'} key={tab} />
        )}
      </Panel>
    </section>
  );
}

const paidAt = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

/**
 * Room-service (QR) orders the guest paid for that could not be billed, say an item sold out
 * or the shift ended meanwhile: each is refunded by hand. Shown only while there are any.
 */
function PaidNotBilled() {
  const { scopedHospitalId } = useLocationContext();
  const query = useQuery({
    queryFn: async () => (await organizationApi.listPaidNotBilled(scopedHospitalId)).data.items,
    queryKey: queryKeys.orderReports('paid-not-billed', scopedHospitalId ?? 'all'),
  });
  const items = query.data ?? [];

  if (items.length === 0) return null;

  return (
    <Panel className="overflow-hidden border-ds-status-bad-fg/30">
      <div className="border-b border-ds-divider bg-ds-status-bad-bg px-4 py-3 text-ds-status-bad-fg">
        <h2 className="text-sm font-bold">
          Paid, not billed: {items.length} room-service {items.length === 1 ? 'order' : 'orders'} to
          refund
        </h2>
        <p className="text-xs">
          The guest paid by UPI but the order could not be placed. Refund each through the payment
          gateway, using its payment reference.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className={cn(tableStyles.table, 'min-w-200')}>
          <thead className={tableStyles.head}>
            <tr>
              <th className={tableStyles.th}>Paid at</th>
              <th className={tableStyles.th}>Restaurant</th>
              <th className={tableStyles.th}>Room</th>
              <th className={cn(tableStyles.th, 'text-right')}>Amount</th>
              <th className={tableStyles.th}>Payment reference</th>
              <th className={tableStyles.th}>Why it was not billed</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className={tableStyles.row} key={item.id}>
                <td className={cn(tableStyles.td, 'whitespace-nowrap')}>
                  {paidAt.format(new Date(item.paidAt ?? item.createdAt))}
                </td>
                <td className={tableStyles.td}>{item.restaurantName}</td>
                <td className={tableStyles.td}>{item.roomNumber ?? '–'}</td>
                <td className={cn(tableStyles.td, 'text-right font-semibold tabular-nums')}>
                  {formatMoney(item.amount)}
                </td>
                <td className={cn(tableStyles.td, 'font-mono text-[12px]')}>
                  {item.provider} · {item.paymentReference ?? '–'}
                </td>
                <td className={tableStyles.td}>{item.reason ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function YesNo({ label, yes }: Readonly<{ label: string; yes: boolean }>) {
  return yes ? (
    <CircleCheck aria-label={`${label}: yes`} className="h-4 w-4 text-ds-status-ok-fg" role="img" />
  ) : (
    <CircleX aria-label={`${label}: no`} className="h-4 w-4 text-ds-status-bad-fg" role="img" />
  );
}

/** Label/value lines, as the History and Order Time Taken cells stack them. */
function Lines({ lines }: Readonly<{ lines: Array<[string, string]> }>) {
  return (
    <ul className="divide-y divide-ds-divider text-[12px]">
      {lines.map(([label, value]) => (
        <li className="whitespace-nowrap py-0.5" key={label}>
          {label} : <span className="font-semibold text-ds-text">{value}</span>
        </li>
      ))}
    </ul>
  );
}

interface Column {
  className?: string;
  header: string;
  cell: (row: OrderReportRow) => ReactNode;
}

const money = (value: number | null) => (value === null ? '–' : formatMoney(value));

const columns: Column[] = [
  {
    // Ticked once the bill is done: handed over and not cancelled. It only shows the status.
    cell: (row) => (
      <input
        aria-label={row.delivered && !row.cancelled ? 'Completed' : 'Not completed'}
        checked={row.delivered && !row.cancelled}
        className="h-4 w-4 accent-ds-primary"
        readOnly
        tabIndex={-1}
        type="checkbox"
      />
    ),
    className: 'w-10',
    header: '',
  },
  {
    cell: (row) => <span className="font-semibold">{row.billNumber}</span>,
    header: 'Bill/Invoice No',
  },
  { cell: (row) => row.orderNumber, header: 'Order No' },
  {
    cell: (row) => <span className="font-semibold">{row.finalStatus}</span>,
    header: 'Final Status',
  },
  {
    cell: (row) => (
      <span className="whitespace-nowrap">{orderedAt.format(new Date(row.placedAt))}</span>
    ),
    header: 'Ordered At',
  },
  {
    cell: (row) => (
      <span className="block min-w-48 text-[12px]">
        {row.items.map((item) => `${item.quantity} x ${item.name}`).join(', ') || '–'}
      </span>
    ),
    header: 'Order',
  },
  { cell: (row) => <YesNo label="POS order" yes={row.posOrder} />, header: 'POS Order' },
  {
    cell: (row) => (
      <span className="whitespace-nowrap">
        {row.posDevice?.code ?? '–'}
        {row.counter ? (
          <span className="block text-[12px] text-ds-muted">{row.counter.counterName}</span>
        ) : null}
      </span>
    ),
    header: 'POS Code',
  },
  { cell: (row) => <YesNo label="In room" yes={row.inRoom} />, header: 'In Room' },
  {
    cell: (row) =>
      row.roomNumber ? `${row.roomNumber}${row.bedNumber ? ` / Bed ${row.bedNumber}` : ''}` : '',
    header: 'Room',
  },
  { cell: (row) => <YesNo label="Paid online" yes={row.online} />, header: 'Online' },
  { cell: (row) => <Lines lines={historyOf(row)} />, header: 'History' },
  {
    cell: (row) => (
      <Lines
        lines={[
          ['Order Taken', minutesLabel(row.orderMinutes)],
          ['Kitchen Taken', minutesLabel(row.kitchenMinutes)],
          ['Delivery Taken', minutesLabel(row.deliveryMinutes)],
          ['Total Order Time', minutesLabel(row.totalMinutes)],
        ]}
      />
    ),
    header: 'Order Time Taken',
  },
  { cell: (row) => money(row.subtotal), className: 'text-right', header: 'Subtotal' },
  { cell: (row) => money(row.discountTotal), className: 'text-right', header: 'Discount' },
  { cell: (row) => money(row.gstTotal), className: 'text-right', header: 'GST Amount' },
  { cell: (row) => money(row.roundOff), className: 'text-right', header: 'Round-off' },
  {
    cell: (row) => <span className="font-semibold">{money(row.grandTotal)}</span>,
    className: 'text-right',
    header: 'Total',
  },
  { cell: (row) => <YesNo label="Paid" yes={row.paid} />, header: 'Paid' },
  { cell: (row) => <YesNo label="Accepted" yes={row.accepted} />, header: 'Accepted' },
  { cell: (row) => <YesNo label="Ready" yes={row.ready} />, header: 'Ready' },
  { cell: (row) => <YesNo label="Delivered" yes={row.delivered} />, header: 'Delivered' },
  {
    cell: (row) => (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <YesNo label="Steward assigned" yes={row.stewardAssigned} />
        {row.stewardName ? <span className="text-[12px]">{row.stewardName}</span> : null}
      </span>
    ),
    header: 'Steward Assigned',
  },
  { cell: (row) => <YesNo label="IHC" yes={row.ihc} />, header: 'IHC' },
  { cell: (row) => <YesNo label="Discounted" yes={row.discounted} />, header: 'Discounted' },
  // ponytail: no one rejects an order yet, so this stays "no" until rejecting is built.
  { cell: () => <YesNo label="Rejected" yes={false} />, header: 'Rejected' },
  { cell: (row) => <YesNo label="Cancelled" yes={row.cancelled} />, header: 'Cancelled' },
  {
    cell: (row) => <span className="block min-w-32 text-[12px]">{row.cancelReason ?? ''}</span>,
    header: 'Cancelled Remarks',
  },
  { cell: (row) => <YesNo label="Refunded" yes={row.refunded} />, header: 'Refunded' },
  {
    cell: (row) => <span className="whitespace-nowrap">{row.restaurant.restaurantName}</span>,
    header: 'Restaurant',
  },
  { cell: (row) => <YesNo label="Sent on ERP" yes={row.erpSent} />, header: 'Sent on ERP' },
  { cell: (row) => <YesNo label="Room consent" yes={row.inRoom} />, header: 'Room Consent' },
  {
    cell: (row) => <span className="whitespace-nowrap">{paymentLabel(row)}</span>,
    header: 'Mode of Payment',
  },
  {
    cell: (row) => <span className="whitespace-nowrap">{row.paymentReference ?? ''}</span>,
    header: 'Transaction ID',
  },
];

function OrdersTab({ complimentary }: Readonly<{ complimentary: boolean }>) {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { showToast } = useToast();
  const today = todayInIndia();
  const [page, setPage] = useUrlNumberParam('page');
  const [limit, setLimit] = useUrlNumberParam('size', 50);
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [from, setFrom] = useUrlParam('from', today);
  const [to, setTo] = useUrlParam('to');
  const [restaurantId, setRestaurantId] = useUrlParam('restaurant');
  const [posDeviceId, setPosDeviceId] = useUrlParam('device');
  const [operatorId, setOperatorId] = useUrlParam('operator');
  const [orderType, setOrderType] = useUrlParam<OrderType>('type', '', [
    'discounted',
    'non-discounted',
  ]);
  const [printing, setPrinting] = useState<string | null>(null);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setRestaurantId('');
    setPosDeviceId('');
    setOperatorId('');
    setPage(1);
  });

  const query = {
    discounted: complimentary ? undefined : orderTypeQuery(orderType),
    from: from || undefined,
    hospitalId: scopedHospitalId,
    isComplimentary: complimentary || undefined,
    limit,
    operatorId: operatorId || undefined,
    page,
    posDeviceId: posDeviceId || undefined,
    restaurantId: restaurantId || undefined,
    search,
    to: to || undefined,
  };
  const ordersQuery = useQuery({
    queryFn: async () => (await organizationApi.listOrderReports(query)).data,
    queryKey: queryKeys.orderReports(query),
  });
  const restaurantsQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listRestaurants({
          hospitalId: scopedHospitalId,
          limit: 100,
          sortBy: 'restaurantName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.orderReports('restaurants', scopedHospitalId ?? 'all'),
  });
  const devicesQuery = useQuery({
    queryFn: async () =>
      (await organizationApi.listPosDevices({ hospitalId: scopedHospitalId, limit: 100 })).data
        .items,
    queryKey: queryKeys.orderReports('devices', scopedHospitalId ?? 'all'),
  });
  const operatorsQuery = useQuery({
    queryFn: async () =>
      (await organizationApi.listOrderReportOperators(scopedHospitalId)).data.items,
    queryKey: queryKeys.orderReports('operators', scopedHospitalId ?? 'all'),
  });

  const rows = ordersQuery.data?.items ?? [];
  const meta = ordersQuery.data?.meta ?? { limit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(
    searchInput || from !== today || to || restaurantId || posDeviceId || operatorId || orderType,
  );
  const filter = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  async function printInvoice(row: OrderReportRow) {
    setPrinting(row.id);
    try {
      await printBill((await organizationApi.getOrderReportBill(row.id)).data, { duplicate: true });
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Invoice not printed',
        variant: 'error',
      });
    } finally {
      setPrinting(null);
    }
  }

  return (
    <>
      <ListToolbar>
        <FilterSearch
          label="Search bills"
          onChange={filter(setSearch)}
          placeholder="Bill or order no., mobile, employee ID, room or transaction ID"
          value={searchInput}
        />
        <RefreshButton onClick={() => void ordersQuery.refetch()} />
        <ClearFiltersButton
          active={hasFilters}
          onClear={() =>
            setUrlParams({
              device: null,
              from: null,
              operator: null,
              page: null,
              q: null,
              restaurant: null,
              to: null,
              type: null,
            })
          }
        />
      </ListToolbar>
      <div className="grid gap-3 border-b border-ds-divider px-3 py-3 sm:grid-cols-3 xl:grid-cols-6">
        <Field label="From" name="orders-from">
          <Input
            id="orders-from"
            max={to || today}
            onChange={(event) => filter(setFrom)(event.target.value)}
            type="date"
            value={from}
          />
        </Field>
        <Field label="To" name="orders-to">
          <Input
            id="orders-to"
            max={today}
            min={from || undefined}
            onChange={(event) => filter(setTo)(event.target.value)}
            type="date"
            value={to}
          />
        </Field>
        <Field label="Restaurant" name="orders-restaurant">
          <Select
            id="orders-restaurant"
            onChange={(event) => filter(setRestaurantId)(event.target.value)}
            value={restaurantId}
          >
            <option value="">All</option>
            {(restaurantsQuery.data ?? []).map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="POS Device" name="orders-device">
          <Select
            id="orders-device"
            onChange={(event) => filter(setPosDeviceId)(event.target.value)}
            value={posDeviceId}
          >
            <option value="">All</option>
            {(devicesQuery.data ?? []).map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} ({device.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="POS Operator" name="orders-operator">
          <Select
            id="orders-operator"
            onChange={(event) => filter(setOperatorId)(event.target.value)}
            value={operatorId}
          >
            <option value="">All</option>
            {(operatorsQuery.data ?? []).map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name}
              </option>
            ))}
          </Select>
        </Field>
        {complimentary ? null : (
          <Field label="Order Type" name="orders-type">
            <Select
              id="orders-type"
              onChange={(event) =>
                filter(setOrderType as (value: string) => void)(event.target.value)
              }
              value={orderType}
            >
              <option value="">Both</option>
              <option value="discounted">Discounted</option>
              <option value="non-discounted">Non-discounted</option>
            </Select>
          </Field>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className={cn(tableStyles.table, 'min-w-max')}>
          <thead className={tableStyles.head}>
            <tr>
              {columns.map((column) => (
                <th
                  className={cn(tableStyles.th, 'whitespace-nowrap', column.className)}
                  key={column.header || 'status'}
                >
                  {column.header ? column.header : <span className="sr-only">Completed</span>}
                </th>
              ))}
              <th className={cn(tableStyles.th, 'sticky right-0 z-10 bg-ds-subtle')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr className={tableStyles.row} data-record-id={row.id} key={row.id}>
                  {columns.map((column) => (
                    <td
                      className={cn(tableStyles.td, 'align-middle text-[13px]', column.className)}
                      key={column.header || 'status'}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                  <td className={cn(tableStyles.td, 'sticky right-0 bg-ds-surface')}>
                    <Button
                      disabled={printing === row.id}
                      onClick={() => void printInvoice(row)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {printing === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Printer className="h-3.5 w-3.5" />
                      )}
                      Invoice
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <QueryState
                colSpan={columns.length + 1}
                error={ordersQuery.error}
                hint="Bills arrive as the counters bill, or nothing matches the filters."
                isError={ordersQuery.isError}
                isLoading={ordersQuery.isLoading}
                label={complimentary ? 'complimentary orders' : 'orders'}
              />
            )}
          </tbody>
        </table>
      </div>
      <ListPager
        limit={meta.limit}
        noun="order"
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        onPageChange={setPage}
        page={meta.page}
        total={meta.total}
        totalPages={meta.totalPages}
      />
    </>
  );
}

const amendedOn = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

function AmendmentsTab() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  const [limit, setLimit] = useUrlNumberParam('size', 10);
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [isOpen, setIsOpen] = useState(false);
  const query = { hospitalId: scopedHospitalId, limit, page, search };
  const amendmentsQuery = useQuery({
    queryFn: async () => (await organizationApi.listOrderAmendments(query)).data,
    queryKey: queryKeys.orderAmendments(query),
  });
  const rows = amendmentsQuery.data?.items ?? [];
  const meta = amendmentsQuery.data?.meta ?? { limit, page, total: 0, totalPages: 1 };

  return (
    <>
      <ListToolbar>
        <FilterSearch
          label="Search amendments"
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Bill or order no., or remarks"
          value={searchInput}
        />
        <RefreshButton onClick={() => void amendmentsQuery.refetch()} />
        {hasPermission('ORDER_AMEND') ? (
          <Button onClick={() => setIsOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            New Amendment
          </Button>
        ) : null}
      </ListToolbar>
      <div className="overflow-x-auto">
        <table className={cn(tableStyles.table, 'min-w-200 table-fixed')}>
          <thead className={tableStyles.head}>
            <tr>
              <th className={cn(tableStyles.th, 'w-28')}>Order ID</th>
              <th className={cn(tableStyles.th, 'w-44')}>Invoice Number</th>
              <th className={cn(tableStyles.th, 'w-32')}>Type</th>
              <th className={tableStyles.th}>Remarks</th>
              <th className={cn(tableStyles.th, 'w-44')}>Amended By</th>
              <th className={cn(tableStyles.th, 'w-44')}>Amended On</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr className={tableStyles.row} key={row.id}>
                  <td className={cn(tableStyles.td, 'font-semibold')}>{row.orderNumber}</td>
                  <td className={cn(tableStyles.td, 'font-semibold')}>{row.billNumber}</td>
                  <td className={tableStyles.td}>Payment Mode</td>
                  <td className={tableStyles.td}>
                    <p className="font-semibold text-ds-text">{row.remarks}</p>
                    <p className="text-[12px] text-ds-muted">
                      {row.fromPaymentMode ? paymentModeNames[row.fromPaymentMode] : '–'} →{' '}
                      {row.toPaymentMode ? paymentModeNames[row.toPaymentMode] : '–'}
                      {row.toPaymentReference ? ` · ${row.toPaymentReference}` : ''}
                    </p>
                  </td>
                  <td className={tableStyles.td}>{row.amendedByName ?? '–'}</td>
                  <td className={cn(tableStyles.td, 'whitespace-nowrap')}>
                    {amendedOn.format(new Date(row.amendedAt))}
                  </td>
                </tr>
              ))
            ) : (
              <QueryState
                colSpan={6}
                error={amendmentsQuery.error}
                hint="An admin amends a bill's payment mode with New Amendment, within 48 hours of billing."
                isError={amendmentsQuery.isError}
                isLoading={amendmentsQuery.isLoading}
                label="amendments"
              />
            )}
          </tbody>
        </table>
      </div>
      <ListPager
        limit={meta.limit}
        noun="amendment"
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        onPageChange={setPage}
        page={meta.page}
        total={meta.total}
        totalPages={meta.totalPages}
      />
      {isOpen ? <NewAmendmentPanel onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

const paymentModes: PaymentMode[] = ['CASH', 'UPI', 'CARD', 'OTHER'];

/** Find a bill of the last 48 hours by order or bill number, then change its payment mode. */
function NewAmendmentPanel({ onClose }: Readonly<{ onClose: () => void }>) {
  const { scopedHospitalId } = useLocationContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [number, setNumber] = useState('');
  const [searched, setSearched] = useState('');
  const [chosen, setChosen] = useState<AmendableBill | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('UPI');
  const [paymentReference, setPaymentReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');

  const findQuery = useQuery({
    enabled: Boolean(searched),
    queryFn: async () =>
      (await organizationApi.findAmendableBills(searched, scopedHospitalId)).data.items,
    queryKey: queryKeys.orderAmendments('find', searched, scopedHospitalId ?? 'all'),
  });
  const amend = useMutation({
    mutationFn: (bill: AmendableBill) =>
      organizationApi.amendBill(bill.id, {
        paymentMode,
        paymentReference: paymentMode === 'CASH' ? undefined : paymentReference.trim(),
        remarks: remarks.trim(),
      }),
    onSuccess: async (_, bill) => {
      showToast({
        description: `${bill.billNumber} is now paid by ${paymentModeNames[paymentMode]}.`,
        title: 'Bill amended',
        variant: 'success',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orderAmendments() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orderReports() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.posBills() }),
      ]);
      onClose();
    },
    onError: (failure) => setError(getApiErrorMessage(failure)),
  });

  function choose(bill: AmendableBill) {
    setChosen(bill);
    setError('');
    setPaymentMode(bill.paymentMode === 'CASH' ? 'UPI' : 'CASH');
    setPaymentReference('');
  }

  function save() {
    if (!chosen) return;
    const needsReference = paymentMode === 'UPI' || paymentMode === 'CARD';

    if (needsReference && !paymentReference.trim()) {
      setError('Enter the transaction ID for a UPI or card payment.');
      return;
    }
    if (!remarks.trim()) {
      setError('Enter remarks: why the bill is amended.');
      return;
    }
    setError('');
    amend.mutate(chosen);
  }

  const results = findQuery.data ?? [];

  return (
    <Modal
      footer={
        chosen ? (
          <div className="flex justify-end gap-2">
            <Button onClick={() => setChosen(null)} type="button" variant="outline">
              Back
            </Button>
            <Button disabled={amend.isPending} onClick={save} type="button">
              {amend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save amendment
            </Button>
          </div>
        ) : undefined
      }
      onClose={onClose}
      open
      side
      title="New Amendment"
    >
      {chosen ? (
        <div className="space-y-4">
          <BillFacts bill={chosen} />
          <Field label="New payment mode" name="amend-mode" required>
            <Select
              id="amend-mode"
              onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}
              value={paymentMode}
            >
              {paymentModes.map((mode) => (
                <option key={mode} value={mode}>
                  {paymentModeNames[mode]}
                </option>
              ))}
            </Select>
          </Field>
          {paymentMode === 'CASH' ? null : (
            <Field
              label="Transaction ID"
              name="amend-reference"
              required={paymentMode === 'UPI' || paymentMode === 'CARD'}
            >
              <Input
                id="amend-reference"
                maxLength={100}
                onChange={(event) => setPaymentReference(event.target.value)}
                value={paymentReference}
              />
            </Field>
          )}
          <div>
            <Label htmlFor="amend-remarks">
              Remarks <span className="text-ds-status-bad-fg">*</span>
            </Label>
            <textarea
              className="mt-1 min-h-20 w-full rounded-control border border-ds-input bg-ds-surface px-3 py-2 text-sm text-ds-text outline-hidden focus:ring-2 focus:ring-ds-primary"
              id="amend-remarks"
              maxLength={500}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="e.g. Cash to UPI: the guest paid by UPI"
              value={remarks}
            />
          </div>
          {error ? (
            <p className="text-sm font-semibold text-ds-status-bad-fg" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSearched(number.trim());
          }}
        >
          <Field label="Order Number / Bill Number" name="amend-number">
            <Input
              autoFocus
              id="amend-number"
              maxLength={60}
              onChange={(event) => setNumber(event.target.value)}
              value={number}
            />
          </Field>
          <Button disabled={!number.trim() || findQuery.isFetching} type="submit">
            {findQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Find Order
          </Button>
          {searched && findQuery.isSuccess && results.length === 0 ? (
            <p className="text-sm text-ds-text-3" role="status">
              No bill of the last 48 hours has order or bill number “{searched}”.
            </p>
          ) : null}
          {findQuery.isError ? (
            <p className="text-sm font-semibold text-ds-status-bad-fg" role="alert">
              {getApiErrorMessage(findQuery.error)}
            </p>
          ) : null}
          {results.length > 0 ? (
            <ul className="space-y-2" aria-label="Bills found">
              {results.map((bill) => (
                <li className="rounded-card border border-ds-border p-3" key={bill.id}>
                  <BillFacts bill={bill} />
                  {bill.refusal ? (
                    <p className="mt-2 text-[12.5px] font-semibold text-ds-status-bad-fg">
                      {bill.refusal}
                    </p>
                  ) : (
                    <Button
                      className="mt-2"
                      onClick={() => choose(bill)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Amend this bill
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      )}
    </Modal>
  );
}

function BillFacts({ bill }: Readonly<{ bill: AmendableBill }>) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
      <dt className="text-ds-muted">Bill</dt>
      <dd className="font-semibold text-ds-text">
        {bill.billNumber} · Order {bill.orderNumber}
      </dd>
      <dt className="text-ds-muted">Billed</dt>
      <dd>{formatStepTime(bill.placedAt)}</dd>
      <dt className="text-ds-muted">Restaurant</dt>
      <dd>
        {bill.restaurant.restaurantName}
        {bill.counter ? ` · ${bill.counter.counterName}` : ''}
      </dd>
      <dt className="text-ds-muted">Total</dt>
      <dd className="font-semibold">
        {bill.grandTotal === null ? '–' : formatMoney(bill.grandTotal)}
      </dd>
      <dt className="text-ds-muted">Payment</dt>
      <dd>
        {paymentLabel(bill)}
        {bill.paymentReference ? ` · ${bill.paymentReference}` : ''}
      </dd>
    </dl>
  );
}
