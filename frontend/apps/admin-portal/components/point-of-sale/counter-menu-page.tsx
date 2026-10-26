'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { FoodType, PosChannel, PosMenuItem } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { useConfirm } from '@/components/confirm-provider';
import { AppPageHeader, RecordAvatar, StatStrip, tableStyles } from '@/components/design-system';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { QueryState } from '@/components/location-empty-states';
import {
  CounterPicker,
  formatMoney,
  NoCounter,
  usePosCounter,
} from '@/components/point-of-sale/shared';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { FilterSearch, SegmentedControl, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

type MenuView = '' | 'on-sale' | 'out-of-stock' | 'sold-out';
type MenuLayout = 'category' | 'list';

const viewMatches: Record<MenuView, (item: PosMenuItem) => boolean> = {
  '': () => true,
  'on-sale': (item) => item.isOnSale,
  'out-of-stock': (item) => item.stock === 0,
  'sold-out': (item) => !item.isAvailable,
};

const foodTypeOptions: Array<{ label: string; value: FoodType }> = [
  { label: 'Veg', value: 'VEG' },
  { label: 'Non-veg', value: 'NON_VEG' },
  { label: 'Egg', value: 'EGGETARIAN' },
];

/** "07:00 – 10:30 · Mon, Tue", or "All day · Every day" when the item has no limits. */
function windowSummary(item: PosMenuItem): string {
  const time =
    item.availableFrom && item.availableTo
      ? `${item.availableFrom.slice(0, 5)} – ${item.availableTo.slice(0, 5)}`
      : 'All day';
  const days =
    item.daysOfWeek.length === 0 || item.daysOfWeek.length === 7
      ? 'Every day'
      : item.daysOfWeek.map((day) => day.charAt(0) + day.slice(1, 3).toLowerCase()).join(', ');

  return `${time} · ${days}`;
}

/** What a counter sells on each channel, its stock, and the switch to take an item off sale. */
export function CounterMenuPageClient() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { counter, counters, query: countersQuery, setCounterId } = usePosCounter();
  const [channel, setChannel] = useUrlParam<PosChannel>('channel', 'COUNTER', ['COUNTER', 'ROOM']);
  const [view, setView] = useUrlParam<MenuView>('view', '', [
    'on-sale',
    'out-of-stock',
    'sold-out',
  ]);
  const [layout, setLayout] = useUrlParam<MenuLayout>('layout', 'category', ['category', 'list']);
  // Category ids folded away ('' is "Other"); every group starts open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [foodTypeFilter, setFoodTypeFilter] = useState<'' | FoodType>('');
  const canUpdate = hasPermission('POS_MENU_UPDATE');

  const menuQuery = useQuery({
    enabled: Boolean(counter),
    queryFn: async () => (await organizationApi.getPosMenu(counter!.id, channel)).data,
    queryKey: queryKeys.posMenu(counter?.id, channel),
  });
  const availability = useMutation({
    mutationFn: ({ isAvailable, menuId }: { isAvailable: boolean; menuId: string }) =>
      organizationApi.setPosMenuAvailability(menuId, isAvailable),
    onError: (error) =>
      showToast({
        description: getApiErrorMessage(error),
        title: 'Availability was not changed',
        variant: 'error',
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.posMenu() }),
    onSuccess: (_response, variables) =>
      showToast({
        recordId: variables.menuId,
        title: variables.isAvailable ? 'Item available' : 'Item unavailable',
        variant: 'success',
      }),
  });

  async function toggleAvailability(item: PosMenuItem, isAvailable: boolean) {
    const confirmed = await confirm(
      isAvailable
        ? {
            confirmLabel: 'Make available',
            description: 'It can be ordered again straight away.',
            title: `Make ${item.itemName} available?`,
          }
        : {
            confirmLabel: 'Make unavailable',
            description:
              'It shows as sold out and can’t be ordered until it is made available again.',
            title: `Make ${item.itemName} unavailable?`,
            tone: 'danger',
          },
    );

    if (confirmed) availability.mutate({ isAvailable, menuId: item.id });
  }

  const items = menuQuery.data?.items ?? [];
  const categories = [
    ...new Map(
      items.flatMap((item) => (item.category ? [[item.category.id, item.category] as const] : [])),
    ).values(),
  ].sort((left, right) => left.categoryName.localeCompare(right.categoryName));
  const needle = search.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      viewMatches[view](item) &&
      (!categoryFilter || item.category?.id === categoryFilter) &&
      (!foodTypeFilter || item.foodType === foodTypeFilter) &&
      (!needle ||
        item.itemName.toLowerCase().includes(needle) ||
        item.itemCode.toLowerCase().includes(needle) ||
        item.menuItemCode.toLowerCase().includes(needle)),
  );
  const count = (match: (item: PosMenuItem) => boolean) =>
    menuQuery.data ? items.filter(match).length : '–';
  // Visible items under their category, by name, with the uncategorised last as "Other".
  const groups = [
    ...categories.map((category) => ({
      id: category.id,
      items: visible.filter((item) => item.category?.id === category.id),
      name: category.categoryName,
    })),
    { id: '', items: visible.filter((item) => !item.category), name: 'Other' },
  ].filter((group) => group.items.length > 0);

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);

      if (!next.delete(id)) {
        next.add(id);
      }

      return next;
    });
  }

  function renderRow(item: PosMenuItem) {
    const isSaving = availability.isPending && availability.variables?.menuId === item.id;

    return (
      <tr
        className="row-accent border-t border-ds-divider transition-colors hover:bg-ds-selected"
        data-record-id={item.id}
        key={item.id}
      >
        <td className={tableStyles.td}>
          <span className="flex min-w-0 items-center gap-3">
            <RecordAvatar foodType={item.foodType} name={item.itemName} />
            <span className="min-w-0">
              <span className={cn('block truncate', tableStyles.title)}>{item.itemName}</span>
              <span className={cn('block truncate', tableStyles.code)}>
                {item.menuItemCode || item.itemCode}
              </span>
            </span>
          </span>
        </td>
        <td className={cn(tableStyles.td, 'truncate text-ds-text-3')}>
          {item.category?.categoryName ?? '—'}
        </td>
        <td
          className={cn(
            tableStyles.td,
            tableStyles.num,
            'text-right',
            item.price === null ? 'text-ds-status-bad-fg' : 'text-ds-text',
          )}
        >
          {item.price === null ? 'No price' : formatMoney(item.price)}
        </td>
        <td className={cn(tableStyles.td, 'text-right text-ds-text-3')}>
          <span className={tableStyles.num}>{item.gstPercent}%</span>
          <span className="block text-[11.5px] text-ds-muted">
            {item.isGstInclusive ? 'Inclusive' : 'Extra'}
          </span>
        </td>
        <td className={cn(tableStyles.td, 'text-[12.5px] text-ds-text-3')}>
          {windowSummary(item)}
        </td>
        <td
          className={cn(
            tableStyles.td,
            'text-right',
            item.stock === null
              ? 'text-[12.5px] text-ds-muted'
              : cn(
                  tableStyles.num,
                  item.stock === 0 ? 'font-semibold text-ds-status-bad-fg' : 'text-ds-text',
                ),
          )}
        >
          {item.stock === null ? 'Not tracked' : item.stock}
        </td>
        <td className={tableStyles.td}>
          <span className="flex flex-wrap items-center gap-2">
            {canUpdate ? (
              <Toggle
                ariaLabel={`${item.itemName} available`}
                checked={item.isAvailable}
                disabled={isSaving}
                onChange={(isAvailable) => void toggleAvailability(item, isAvailable)}
              />
            ) : null}
            {item.isOnSale ? (
              <span className="rounded-full bg-ds-status-ok-bg px-2.5 py-0.5 text-[11.5px] font-bold text-ds-status-ok-fg">
                On sale now
              </span>
            ) : (
              <span className="text-[12px] text-ds-muted">
                {item.isAvailable ? 'Not now' : 'Sold out'}
              </span>
            )}
          </span>
        </td>
      </tr>
    );
  }

  function showView(next: MenuView) {
    setView((current) => (current === next ? '' : next));
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={<CounterPicker counter={counter} counters={counters} onChange={setCounterId} />}
        count={menuQuery.data ? items.length : undefined}
        description="What this counter sells, at which price, and whether it is on sale right now."
        title="Counter Menu"
      />
      {counter ? (
        <>
          <StatStrip
            label="Counter menu at a glance"
            stats={[
              {
                active: view === 'on-sale',
                label: 'On sale now',
                onSelect: () => showView('on-sale'),
                tone: 'ok',
                value: count(viewMatches['on-sale']),
              },
              {
                active: view === 'sold-out',
                label: 'Sold out',
                onSelect: () => showView('sold-out'),
                tone: 'pending',
                value: count(viewMatches['sold-out']),
              },
              {
                active: view === 'out-of-stock',
                label: 'Out of stock',
                onSelect: () => showView('out-of-stock'),
                tone: 'bad',
                value: count(viewMatches['out-of-stock']),
              },
            ]}
          />
          <Panel aria-label="Counter menu" className="overflow-hidden" role="region">
            <ListToolbar>
              <SegmentedControl<PosChannel>
                label="Price channel"
                onChange={setChannel}
                options={[
                  { label: 'Counter', value: 'COUNTER' },
                  { label: 'Room', value: 'ROOM' },
                ]}
                value={channel}
              />
              <SegmentedControl<MenuLayout>
                label="Layout"
                onChange={setLayout}
                options={[
                  { label: 'By category', value: 'category' },
                  { label: 'List', value: 'list' },
                ]}
                value={layout}
              />
              <FilterSearch
                label="Search the menu"
                onChange={setSearch}
                placeholder="Item name, item code or menu code"
                value={search}
              />
              <FiltersMenu activeCount={[categoryFilter, foodTypeFilter].filter(Boolean).length}>
                <FilterField label="Category">
                  <Select
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    value={categoryFilter}
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.categoryName}
                      </option>
                    ))}
                  </Select>
                </FilterField>
                <FilterField label="Food type">
                  <Select
                    onChange={(event) => setFoodTypeFilter(event.target.value as '' | FoodType)}
                    value={foodTypeFilter}
                  >
                    <option value="">All food types</option>
                    {foodTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FilterField>
              </FiltersMenu>
              <RefreshButton onClick={() => void menuQuery.refetch()} />
              <ClearFiltersButton
                active={Boolean(search || categoryFilter || foodTypeFilter)}
                onClear={() => {
                  setSearch('');
                  setCategoryFilter('');
                  setFoodTypeFilter('');
                }}
              />
            </ListToolbar>
            <div className="overflow-x-auto">
              <table className={cn(tableStyles.table, 'phone-cards min-w-240 table-fixed')}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={cn(tableStyles.th, 'w-[24%]')}>Item</th>
                    <th className={cn(tableStyles.th, 'w-[13%]')}>Category</th>
                    <th className={cn(tableStyles.th, 'w-[11%] text-right')}>Price</th>
                    <th className={cn(tableStyles.th, 'w-[9%] text-right')}>GST</th>
                    <th className={cn(tableStyles.th, 'w-[17%]')}>Sold</th>
                    <th className={cn(tableStyles.th, 'w-[10%] text-right')}>Stock</th>
                    <th className={cn(tableStyles.th, 'w-[16%]')}>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length > 0 ? (
                    layout === 'list' ? (
                      visible.map(renderRow)
                    ) : (
                      groups.map((group) => {
                        const isOpen = !collapsed.has(group.id);

                        return (
                          <Fragment key={group.id || 'other'}>
                            <tr className="border-t border-ds-divider bg-ds-subtle">
                              <td className="p-0" colSpan={7}>
                                <button
                                  aria-expanded={isOpen}
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-semibold text-ds-text hover:bg-ds-selected"
                                  onClick={() => toggleGroup(group.id)}
                                  type="button"
                                >
                                  <ChevronDown
                                    aria-hidden="true"
                                    className={cn(
                                      'h-4 w-4 text-ds-muted transition-transform',
                                      !isOpen && '-rotate-90',
                                    )}
                                  />
                                  {group.name}
                                  <span className="font-normal text-ds-muted">
                                    · {group.items.length}{' '}
                                    {group.items.length === 1 ? 'item' : 'items'}
                                  </span>
                                </button>
                              </td>
                            </tr>
                            {isOpen ? group.items.map(renderRow) : null}
                          </Fragment>
                        );
                      })
                    )
                  ) : (
                    <QueryState
                      atLocation={false}
                      colSpan={7}
                      error={menuQuery.error}
                      hint="Items reach a counter's menu from Item & Menu Setup, or nothing matches the filters."
                      isError={menuQuery.isError}
                      isLoading={menuQuery.isLoading}
                      label="menu items"
                    />
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <NoCounter isLoading={countersQuery.isLoading} />
      )}
    </section>
  );
}
