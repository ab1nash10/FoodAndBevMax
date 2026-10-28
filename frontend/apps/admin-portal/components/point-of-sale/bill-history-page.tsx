'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type {
  OrderStatus,
  PaymentMode,
  PosBillListQuery,
  PosChannel,
  SortOrder,
} from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  AppPageHeader,
  ListPager,
  StatStrip,
  StatusChip,
  tableStyles,
  type Stat,
} from '@/components/design-system';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { QueryState } from '@/components/location-empty-states';
import {
  PosBillPanel,
  counterLabel,
  formatMoney,
  paymentModeLabels,
  todayInIndia,
  usePosCounter,
} from '@/components/point-of-sale/shared';
import { WeekStrip } from '@/components/point-of-sale/week-strip';
import { Input, Panel, Select } from '@/components/ui';
import { FilterSearch } from '@/components/ui-controls';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { statusPresentation } from '@/lib/status';
import {
  openRowLink,
  setUrlParams,
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const listLimit = 10;
const billStatuses: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED'];
const channels: PosChannel[] = ['COUNTER', 'ROOM'];
const paymentModes: PaymentMode[] = ['CARD', 'UPI', 'CASH', 'OTHER'];
const sortFields = ['placedAt', 'billNumber', 'grandTotal'] as const;

const placedDate = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kolkata',
});
const placedTime = new Intl.DateTimeFormat('en-IN', {
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});
// Business days are plain YYYY-MM-DD dates, read at UTC midnight so no zone shifts them.
const businessDay = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const formatBusinessDay = (day: string) => businessDay.format(new Date(`${day}T00:00:00Z`));

/** Bill history, or (with `complimentary`) only the complimentary bills, for admins to review. */
export function BillHistoryPageClient({ complimentary = false }: { complimentary?: boolean }) {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { counters } = usePosCounter();
  const today = todayInIndia();
  const [billId] = useUrlParam('id');
  const hrefWith = useHrefWith();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [from, setFrom] = useUrlParam('from', today);
  const [to, setTo] = useUrlParam('to', today);
  const [counterFilter, setCounterFilter] = useUrlParam('counter');
  const [channelFilter, setChannelFilter] = useUrlParam<'' | PosChannel>('channel', '', channels);
  const [paymentFilter, setPaymentFilter] = useUrlParam<'' | PaymentMode>(
    'payment',
    '',
    paymentModes,
  );
  const [statusFilter, setStatusFilter] = useUrlParam<'' | OrderStatus>('view', '', billStatuses);
  const [sortBy, setSortBy] = useUrlParam<(typeof sortFields)[number]>(
    'sortBy',
    'placedAt',
    sortFields,
  );
  const [sortOrder, setSortOrder] = useUrlParam<SortOrder>('sort', 'desc', ['asc', 'desc']);
  // Complimentary bills carry no payment mode, so that filter has no place on their page.
  const payment = complimentary ? '' : paymentFilter;

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setCounterFilter('');
    setPage(1);
  });

  // Everything but the status, which the stat strip splits by.
  const baseQuery: PosBillListQuery = {
    channel: channelFilter || undefined,
    counterId: counterFilter,
    from,
    hospitalId: scopedHospitalId,
    isComplimentary: complimentary || undefined,
    paymentMode: payment || undefined,
    search,
    to,
  };
  const filterKey = [
    complimentary,
    scopedHospitalId,
    counterFilter,
    from,
    to,
    channelFilter,
    payment,
    search,
  ] as const;

  const billsQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listPosBills({
          ...baseQuery,
          limit: listLimit,
          page,
          sortBy,
          sortOrder,
          status: statusFilter || undefined,
        })
      ).data,
    queryKey: queryKeys.posBills(...filterKey, statusFilter, page, sortBy, sortOrder),
  });

  const statsQuery = useQuery({
    queryFn: async () => {
      const { meta } = (
        await organizationApi.listPosBills({ ...baseQuery, limit: 0, statusCounts: true })
      ).data;

      return {
        all: meta.total,
        cancelled: meta.statusCounts?.CANCELLED ?? 0,
        complimentary: complimentary ? null : (meta.complimentaryCount ?? 0),
      };
    },
    queryKey: queryKeys.posBills('stats', ...filterKey),
  });

  // Takings are only known per counter and day; a wider range shows counts alone.
  const singleCounterDay = Boolean(counterFilter) && from === to;
  const summaryQuery = useQuery({
    enabled: singleCounterDay,
    queryFn: async () => (await organizationApi.getPosDaySummary(counterFilter, from)).data,
    queryKey: queryKeys.posSummary(counterFilter, from),
  });

  const stats = statsQuery.data;
  const summary = singleCounterDay ? summaryQuery.data : undefined;
  const bills = billsQuery.data?.items ?? [];
  const meta = billsQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const isRange = from !== to;
  const activeFilterCount = [isRange, counterFilter, channelFilter, payment, statusFilter].filter(
    Boolean,
  ).length;
  const hasFilters = Boolean(searchInput || from !== today || to !== today || activeFilterCount);
  const colSpan = 7;

  function clearFilters() {
    setSearch('');
    setFrom(today);
    setTo(today);
    setCounterFilter('');
    setChannelFilter('');
    setPaymentFilter('');
    setStatusFilter('');
    setPage(1);
  }

  function showStatus(status: '' | OrderStatus) {
    setStatusFilter(status);
    setPage(1);
  }

  const statList: Stat[] = [
    {
      active: !statusFilter,
      label: complimentary ? 'Complimentary bills' : 'All bills',
      onSelect: () => showStatus(''),
      share: stats?.all ? 1 : undefined,
      value: stats?.all ?? '–',
    },
    {
      active: statusFilter === 'CANCELLED',
      label: 'Cancelled',
      onSelect: () => showStatus(statusFilter === 'CANCELLED' ? '' : 'CANCELLED'),
      share: stats?.all ? stats.cancelled / stats.all : undefined,
      tone: 'bad',
      value: stats?.cancelled ?? '–',
    },
  ];

  if (!complimentary) {
    statList.push({
      label: 'Complimentary',
      share:
        stats?.all && stats.complimentary !== null ? stats.complimentary / stats.all : undefined,
      tone: 'pending',
      value: stats?.complimentary ?? '–',
    });
  }

  if (singleCounterDay) {
    statList.push(
      complimentary
        ? {
            label: "Day's complimentary value",
            tone: 'pending',
            value: summary ? formatMoney(summary.complimentary.amount) : '–',
          }
        : {
            label: "Day's sales",
            tone: 'ok',
            value: summary ? formatMoney(summary.sales) : '–',
          },
    );
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        count={stats?.all}
        description={
          complimentary
            ? 'Bills given free of charge. Admins review each one here with the reason it was given.'
            : 'Every bill raised at the counters, by business day.'
        }
        title={complimentary ? 'Complimentary' : 'Bill History'}
      />
      <StatStrip
        label={complimentary ? 'Complimentary bills at a glance' : 'Bills at a glance'}
        stats={statList}
      />
      <Panel className="overflow-hidden">
        <ListToolbar>
          <FilterSearch
            label="Search bills"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Invoice or order no., mobile, employee ID or room"
            value={searchInput}
          />
          <FiltersMenu activeCount={activeFilterCount}>
            <FilterField label="From date">
              <Input
                max={to}
                onChange={(event) => {
                  setFrom(event.target.value || today);
                  setPage(1);
                }}
                type="date"
                value={from}
              />
            </FilterField>
            <FilterField label="To date">
              <Input
                max={today}
                min={from}
                onChange={(event) => {
                  setTo(event.target.value || today);
                  setPage(1);
                }}
                type="date"
                value={to}
              />
            </FilterField>
            <FilterField label="Counter">
              <Select
                onChange={(event) => {
                  setCounterFilter(event.target.value);
                  setPage(1);
                }}
                value={counterFilter}
              >
                <option value="">All counters</option>
                {counters.map((counter) => (
                  <option key={counter.id} value={counter.id}>
                    {counterLabel(counter)}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Channel">
              <Select
                onChange={(event) => {
                  setChannelFilter(event.target.value as '' | PosChannel);
                  setPage(1);
                }}
                value={channelFilter}
              >
                <option value="">All channels</option>
                <option value="COUNTER">Counter</option>
                <option value="ROOM">Room</option>
              </Select>
            </FilterField>
            {complimentary ? null : (
              <FilterField label="Payment mode">
                <Select
                  onChange={(event) => {
                    setPaymentFilter(event.target.value as '' | PaymentMode);
                    setPage(1);
                  }}
                  value={paymentFilter}
                >
                  <option value="">All payment modes</option>
                  {paymentModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {paymentModeLabels[mode]}
                    </option>
                  ))}
                </Select>
              </FilterField>
            )}
            <FilterField label="Status">
              <Select
                onChange={(event) => {
                  setStatusFilter(event.target.value as '' | OrderStatus);
                  setPage(1);
                }}
                value={statusFilter}
              >
                <option value="">All statuses</option>
                {billStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusPresentation(status).label}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FiltersMenu>
          <SortControl
            onOrderChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            onSortByChange={(value) => {
              setSortBy(value as (typeof sortFields)[number]);
              setPage(1);
            }}
            options={[
              { label: 'Placed', value: 'placedAt' },
              { label: 'Bill no', value: 'billNumber' },
              { label: 'Amount', value: 'grandTotal' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton
            onClick={() => {
              void billsQuery.refetch();
              void statsQuery.refetch();
              if (singleCounterDay) {
                void summaryQuery.refetch();
              }
            }}
          />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-ds-divider px-3 py-2">
          {isRange ? (
            <p className="mr-auto text-[12.5px] text-ds-text-3">
              {formatBusinessDay(from)} – {formatBusinessDay(to)}
            </p>
          ) : null}
          <WeekStrip
            anchor={to}
            onSelect={(day) => {
              setFrom(day);
              setTo(day);
              setPage(1);
            }}
            today={today}
            value={isRange ? null : from}
          />
        </div>
        <div className="overflow-x-auto">
          {/* What a reviewer scans for; the rest (instructions, subtotal, GST, lines) is in the
              bill's panel, which the row opens. Complimentary bills have no payment mode, so
              their page shows the reason in that place. */}
          <table className={cn(tableStyles.table, 'phone-cards min-w-208 table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-40')}>Bill</th>
                <th className={cn(tableStyles.th, 'w-32')}>Placed</th>
                <th className={tableStyles.th}>Counter</th>
                <th className={tableStyles.th}>Items</th>
                <th className={cn(tableStyles.th, 'w-36 text-right')}>Total</th>
                {complimentary ? (
                  <th className={tableStyles.th}>Reason</th>
                ) : (
                  <th className={cn(tableStyles.th, 'w-28')}>Payment</th>
                )}
                <th className={cn(tableStyles.th, 'w-28')}>Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.length > 0 ? (
                bills.map((bill) => {
                  const isCancelled = bill.status === 'CANCELLED';
                  const placedAt = new Date(bill.placedAt);
                  const itemList = bill.items
                    .map((item) => `${item.quantity} × ${item.name}`)
                    .join(', ');

                  return (
                    // The whole row opens the bill (its number is the link it follows).
                    <tr
                      className={tableStyles.row}
                      data-record-id={bill.id}
                      key={bill.id}
                      onClick={openRowLink}
                    >
                      <td className={tableStyles.td}>
                        <Link
                          className={cn(
                            tableStyles.num,
                            'block truncate rounded-sm text-[13px] font-semibold text-ds-text hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                          )}
                          data-row-link=""
                          href={hrefWith({ id: bill.id })}
                          prefetch={false}
                        >
                          {bill.billNumber}
                        </Link>
                        <p className={cn('truncate', tableStyles.code)}>
                          {[
                            bill.orderNumber,
                            bill.roomNumber ? `Room ${bill.roomNumber}` : null,
                            bill.customerMobile,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </td>
                      <td className={tableStyles.td}>
                        <p className="whitespace-nowrap text-ds-text-2">
                          {placedDate.format(placedAt)}
                        </p>
                        <p className="whitespace-nowrap text-[12px] text-ds-muted">
                          {placedTime.format(placedAt)}
                        </p>
                      </td>
                      <td className={tableStyles.td}>
                        <p className="truncate text-ds-text-2">{bill.restaurant.restaurantName}</p>
                        <p className="truncate text-[12px] text-ds-muted">
                          {bill.counter.counterName}
                        </p>
                      </td>
                      <td className={tableStyles.td}>
                        <p className="text-ds-text">
                          {bill.itemCount === 1 ? '1 item' : `${bill.itemCount} items`}
                        </p>
                        <p
                          className="truncate text-[12px] text-ds-muted"
                          title={itemList || undefined}
                        >
                          {itemList || '–'}
                        </p>
                      </td>
                      <td className={cn(tableStyles.td, 'text-right')}>
                        <p
                          className={cn(
                            tableStyles.num,
                            isCancelled ? 'text-ds-muted line-through' : 'text-ds-text',
                          )}
                        >
                          {formatMoney(bill.grandTotal)}
                        </p>
                        {bill.discountTotal ? (
                          <p className={cn('text-[12px] text-ds-muted', tableStyles.num)}>
                            −{formatMoney(bill.discountTotal)}
                            {bill.discountPercent ? ` · ${bill.discountPercent}%` : null}
                          </p>
                        ) : null}
                      </td>
                      {complimentary ? (
                        <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                          <p className="line-clamp-2" title={bill.complimentaryReason ?? undefined}>
                            {bill.complimentaryReason || '–'}
                          </p>
                        </td>
                      ) : (
                        <td className={cn(tableStyles.td, 'text-ds-text-3')}>
                          <p className="truncate">
                            {bill.isComplimentary
                              ? 'Complimentary'
                              : bill.paymentMode
                                ? paymentModeLabels[bill.paymentMode]
                                : '–'}
                          </p>
                          {bill.paymentReference ? (
                            <p
                              className={cn('truncate', tableStyles.code)}
                              title={bill.paymentReference}
                            >
                              {bill.paymentReference}
                            </p>
                          ) : null}
                        </td>
                      )}
                      <td className={tableStyles.td}>
                        <StatusChip status={bill.status} />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={colSpan}
                  error={billsQuery.error}
                  hint={
                    complimentary
                      ? 'Complimentary bills arrive when a till gives a meal free, or nothing matches the filters.'
                      : 'Bills arrive as the counters bill, or nothing matches the filters.'
                  }
                  isError={billsQuery.isError}
                  isLoading={billsQuery.isLoading}
                  label={complimentary ? 'complimentary bills' : 'bills'}
                />
              )}
            </tbody>
          </table>
        </div>
        <ListPager
          limit={meta.limit}
          noun="bill"
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
      <PosBillPanel billId={billId || null} onClose={() => setUrlParams({ id: null })} />
    </section>
  );
}
