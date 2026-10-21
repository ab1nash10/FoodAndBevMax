'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
import Link from 'next/link';
import type { StockBalanceStatus } from '@aahar/api-client';
import {
  AppPageHeader,
  ListPager,
  StatStrip,
  StatusChip,
  tableStyles,
} from '@/components/design-system';
import {
  formatDateOnly,
  formatEnum,
  formatQuantity,
  listLimit,
  plural,
  stockStatuses,
} from '@/components/inventory/shared/utils';
import { Chip, levelChip } from '@/components/inventory/stock-levels/parts';
import { sendFromStoreHref } from '@/components/inventory/transfers/transfer-prefill';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { QueryState } from '@/components/location-empty-states';
import {
  CounterPicker,
  formatDateTime,
  NoCounter,
  todayInIndia,
  usePosCounter,
} from '@/components/point-of-sale/shared';
import { IfCanOpen } from '@/components/record-link';
import { Input, Panel, Select } from '@/components/ui';
import { FilterSearch, SegmentedControl } from '@/components/ui-controls';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

type StockTab = 'movements' | 'stock' | 'summary';

const movementLabels: Record<string, string> = {
  COUNTER_RECEIVE_IN: 'Received',
  SALE_CANCEL_IN: 'Bill cancelled',
  SALE_OUT: 'Sold',
};

function formatQty(value: number): string {
  return value ? value.toFixed(3) : '—';
}

/** Per item for a day: stock added, consumed and available; plus batches and every movement. */
export function CounterStockPageClient() {
  const { counter, counters, query: countersQuery, setCounterId } = usePosCounter();
  const today = todayInIndia();
  const [tab, setTab] = useUrlParam<StockTab>('tab', 'summary', ['movements', 'stock', 'summary']);
  const [date, setDate] = useUrlParam('date', today);
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [statusFilter, setStatusFilter] = useUrlParam<'' | StockBalanceStatus>(
    'status',
    '',
    stockStatuses,
  );
  const counterId = counter?.id;

  const stockQuery = useQuery({
    enabled: Boolean(counterId) && tab === 'stock',
    queryFn: async () =>
      (
        await organizationApi.listCounterStock({
          limit: listLimit,
          locationId: counterId,
          page,
          search,
          status: statusFilter || undefined,
        })
      ).data,
    queryKey: queryKeys.counterStock(counterId, page, search, statusFilter),
  });
  const ledgerQuery = useQuery({
    enabled: Boolean(counterId) && tab === 'movements',
    queryFn: async () =>
      (
        await organizationApi.listCounterStockLedgers({
          limit: listLimit,
          locationId: counterId,
          page,
          search,
          sortBy: 'transactionDateTime',
          sortOrder: 'desc',
        })
      ).data,
    queryKey: queryKeys.counterStock('ledger', counterId, page, search),
  });
  const summaryQuery = useQuery({
    enabled: Boolean(counterId) && tab === 'summary',
    queryFn: async () => (await organizationApi.getPosStockSummary(counterId!, date)).data,
    queryKey: queryKeys.counterStock('summary', counterId, date),
  });
  // Store items running low or out here, by Stock levels' days-of-cover rule.
  const levelsQuery = useQuery({
    enabled: Boolean(counterId),
    queryFn: async () =>
      (await organizationApi.listCounterStockLevels({ locationId: counterId })).data,
    queryKey: queryKeys.counterStock('levels', counterId),
  });
  const coverDays = levelsQuery.data?.lowCoverDays ?? 3;
  const lowLevels = (levelsQuery.data?.items ?? []).filter((level) => level.level !== 'OK');
  const lowByItem = new Map(lowLevels.map((level) => [level.itemId, level]));
  const active = tab === 'summary' ? summaryQuery : tab === 'stock' ? stockQuery : ledgerQuery;
  const listData = tab === 'stock' ? stockQuery.data : ledgerQuery.data;
  const meta = listData?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const summaryItems = summaryQuery.data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const summaryRows = needle
    ? summaryItems.filter(
        (item) =>
          item.itemName.toLowerCase().includes(needle) ||
          item.itemCode.toLowerCase().includes(needle),
      )
    : summaryItems;
  const summaryCount = (match: (item: (typeof summaryItems)[number]) => boolean) =>
    summaryQuery.data ? summaryItems.filter(match).length : '–';

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
        count={tab === 'summary' ? summaryQuery.data?.items.length : listData?.meta.total}
        description="Stock received at this counter from transfers, less what it has sold."
        title="Counter Stock"
      />
      {counter && tab === 'summary' ? (
        <StatStrip
          label="Counter stock at a glance"
          stats={[
            { label: 'Items', value: summaryCount(() => true) },
            { label: 'In stock', tone: 'ok', value: summaryCount((item) => item.available > 0) },
            {
              label: 'Out of stock',
              tone: 'bad',
              value: summaryCount((item) => item.isTracked && item.available === 0),
            },
          ]}
        />
      ) : null}
      {counter ? (
        <Panel aria-label="Counter stock" className="overflow-hidden" role="region">
          <ListToolbar>
            <SegmentedControl<StockTab>
              className="shrink-0"
              label="Show"
              onChange={(value) => {
                setTab(value);
                setPage(1);
              }}
              options={[
                { label: 'Summary', value: 'summary' },
                { label: 'Batches', value: 'stock' },
                { label: 'Movements', value: 'movements' },
              ]}
              value={tab}
            />
            {tab === 'summary' ? (
              <Input
                aria-label="Business date"
                className="h-10 w-auto"
                max={today}
                onChange={(event) => setDate(event.target.value || today)}
                type="date"
                value={date}
              />
            ) : null}
            <FilterSearch
              label="Search counter stock"
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Item name or code"
              value={searchInput}
            />
            {tab === 'stock' ? (
              <FiltersMenu activeCount={statusFilter ? 1 : 0}>
                <FilterField label="Status">
                  <Select
                    onChange={(event) => {
                      setStatusFilter(event.target.value as '' | StockBalanceStatus);
                      setPage(1);
                    }}
                    value={statusFilter}
                  >
                    <option value="">All statuses</option>
                    {stockStatuses.map((status) => (
                      <option key={status} value={status}>
                        {formatEnum(status)}
                      </option>
                    ))}
                  </Select>
                </FilterField>
              </FiltersMenu>
            ) : null}
            <RefreshButton onClick={() => void active.refetch()} />
          </ListToolbar>
          {lowLevels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ds-divider bg-ds-status-pending-bg/40 px-5 py-2.5">
              <span className="mr-auto text-[13px] text-ds-status-pending-fg">
                <span className="font-semibold">
                  {plural(lowLevels.length, 'item')} running low or out.
                </span>{' '}
                A transfer from the store tops each up to {plural(coverDays, 'day')} of its usual
                sales.
              </span>
              <IfCanOpen href="/inventory/transfers/new">
                <Button asChild size="sm" variant="outline">
                  <Link href={sendFromStoreHref('COUNTER', lowLevels, coverDays)}>
                    <ArrowRightLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                    Send all from store
                  </Link>
                </Button>
              </IfCanOpen>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            {tab === 'summary' ? (
              <table className={cn(tableStyles.table, 'min-w-180 table-fixed')}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={cn(tableStyles.th, 'w-[40%]')}>Item</th>
                    <th className={cn(tableStyles.th, 'w-[20%] text-right')}>Stock added</th>
                    <th className={cn(tableStyles.th, 'w-[20%] text-right')}>Stock consumed</th>
                    <th className={cn(tableStyles.th, 'w-[20%] text-right')}>Available stock</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.length ? (
                    summaryRows.map((item) => {
                      const low = lowByItem.get(item.itemId);

                      return (
                        <tr className="border-t border-ds-divider" key={item.itemId}>
                          <td className={tableStyles.td}>
                            <p className={cn('truncate', tableStyles.title)}>{item.itemName}</p>
                            <p className={cn('truncate', tableStyles.code)}>{item.itemCode}</p>
                            {low ? (
                              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Chip className={levelChip[low.level].className}>
                                  {levelChip[low.level].label}
                                </Chip>
                                <IfCanOpen href="/inventory/transfers/new">
                                  <Link
                                    className="text-xs font-semibold text-ds-link hover:underline"
                                    href={sendFromStoreHref('COUNTER', [low], coverDays)}
                                  >
                                    Send from store
                                  </Link>
                                </IfCanOpen>
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={cn(
                              tableStyles.td,
                              tableStyles.num,
                              'text-right',
                              item.received ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                            )}
                          >
                            {formatQuantity(item.received)}
                          </td>
                          <td
                            className={cn(
                              tableStyles.td,
                              tableStyles.num,
                              'text-right',
                              item.consumed ? 'text-ds-text' : 'text-ds-muted',
                            )}
                          >
                            {formatQuantity(item.consumed)}
                          </td>
                          {!item.isTracked && item.available === 0 ? (
                            <td
                              className={cn(
                                tableStyles.td,
                                'text-right text-[12.5px] text-ds-muted',
                              )}
                            >
                              Not tracked
                            </td>
                          ) : (
                            <td
                              className={cn(
                                tableStyles.td,
                                tableStyles.num,
                                'text-right font-semibold',
                                item.available ? 'text-ds-text' : 'text-ds-status-bad-fg',
                              )}
                            >
                              {formatQuantity(item.available)}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <QueryState
                      atLocation={false}
                      colSpan={4}
                      error={summaryQuery.error}
                      hint="Items reach a counter from Item & Menu Setup, or nothing matches the search."
                      isError={summaryQuery.isError}
                      isLoading={summaryQuery.isLoading}
                      label="counter stock"
                    />
                  )}
                </tbody>
              </table>
            ) : tab === 'stock' ? (
              <table className={cn(tableStyles.table, 'min-w-180 table-fixed')}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={cn(tableStyles.th, 'w-[34%]')}>Item</th>
                    <th className={cn(tableStyles.th, 'w-[18%]')}>Batch</th>
                    <th className={cn(tableStyles.th, 'w-[16%]')}>Expiry</th>
                    <th className={cn(tableStyles.th, 'w-[14%] text-right')}>Available</th>
                    <th className={cn(tableStyles.th, 'w-[18%]')}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockQuery.data?.items.length ? (
                    stockQuery.data.items.map((stock) => (
                      <tr className="border-t border-ds-divider" key={stock.id}>
                        <td className={tableStyles.td}>
                          <p className={cn('truncate', tableStyles.title)}>{stock.item.itemName}</p>
                          <p className={cn('truncate', tableStyles.code)}>{stock.item.itemCode}</p>
                        </td>
                        <td className={cn(tableStyles.td, tableStyles.code, 'truncate')}>
                          {stock.batchNumber ?? 'No batch'}
                        </td>
                        <td className={cn(tableStyles.td, 'whitespace-nowrap text-ds-muted')}>
                          {formatDateOnly(stock.expiryDate)}
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.num,
                            'text-right font-semibold text-ds-text',
                          )}
                        >
                          {stock.availableQty.toFixed(3)}
                        </td>
                        <td className={tableStyles.td}>
                          <StatusChip status={stock.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <QueryState
                      atLocation={false}
                      colSpan={5}
                      error={stockQuery.error}
                      hint="Stock arrives when the counter receives a transfer, or nothing matches the filters."
                      isError={stockQuery.isError}
                      isLoading={stockQuery.isLoading}
                      label="counter stock"
                    />
                  )}
                </tbody>
              </table>
            ) : (
              <table className={cn(tableStyles.table, 'min-w-200 table-fixed')}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={cn(tableStyles.th, 'w-[19%]')}>When</th>
                    <th className={cn(tableStyles.th, 'w-[29%]')}>Item</th>
                    <th className={cn(tableStyles.th, 'w-[16%]')}>Movement</th>
                    <th className={cn(tableStyles.th, 'w-[12%] text-right')}>In</th>
                    <th className={cn(tableStyles.th, 'w-[12%] text-right')}>Out</th>
                    <th className={cn(tableStyles.th, 'w-[12%] text-right')}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQuery.data?.items.length ? (
                    ledgerQuery.data.items.map((entry) => (
                      <tr className="border-t border-ds-divider" key={entry.id}>
                        <td className={cn(tableStyles.td, 'text-ds-text-3')}>
                          {formatDateTime(entry.transactionDateTime)}
                        </td>
                        <td className={tableStyles.td}>
                          <p className={cn('truncate', tableStyles.title)}>{entry.item.itemName}</p>
                          <p className={cn('truncate', tableStyles.code)}>
                            {entry.batchNumber ?? entry.item.itemCode}
                          </p>
                        </td>
                        <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                          {movementLabels[entry.transactionType] ??
                            formatEnum(entry.transactionType)}
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.num,
                            'text-right text-ds-status-ok-fg',
                          )}
                        >
                          {formatQty(entry.qtyIn)}
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.num,
                            'text-right text-ds-status-bad-fg',
                          )}
                        >
                          {formatQty(entry.qtyOut)}
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.num,
                            'text-right font-semibold text-ds-text',
                          )}
                        >
                          {entry.balanceAfter.toFixed(3)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <QueryState
                      atLocation={false}
                      colSpan={6}
                      error={ledgerQuery.error}
                      hint="Receiving a transfer, billing and cancelling a bill each record a movement."
                      isError={ledgerQuery.isError}
                      isLoading={ledgerQuery.isLoading}
                      label="stock movements"
                    />
                  )}
                </tbody>
              </table>
            )}
          </div>
          {tab === 'summary' ? null : (
            <ListPager
              limit={meta.limit}
              noun={tab === 'stock' ? 'stock line' : 'movement'}
              onPageChange={setPage}
              page={meta.page}
              total={meta.total}
              totalPages={meta.totalPages}
            />
          )}
        </Panel>
      ) : (
        <NoCounter isLoading={countersQuery.isLoading} />
      )}
    </section>
  );
}
