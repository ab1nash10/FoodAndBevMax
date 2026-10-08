'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Item, ItemInput, ItemType, SortOrder } from '@aahar/api-client';
import { EmptyState, FoodTypeMarker } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Panel, Skeleton } from '@/components/ui';
import {
  DetailPanel,
  FilterBar,
  FilterSearch,
  FilterSelect,
  SegmentedControl,
  Toggle,
} from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { IfCanOpen } from '@/components/record-link';
import {
  openRowLink,
  setUrlParams,
  useHrefWith,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { invalidateItemQueries } from '@/lib/query-invalidation';
import { ItemDetailTabs } from '@/components/master-data/items/item-detail-tabs';
import {
  ItemFormFields,
  LoadingRows,
  emptyItemFormValues,
  foodTypeValues,
  rupees,
  similarItemError,
  todayValue,
  useItemCategoryOptions,
  type FoodTypeFilter,
  type ItemFormValues,
  itemSchemaLoader,
} from '@/components/master-data/items/shared';
import { SubmitButton } from '@/components/master-data/shared/components';
import type { ActiveFilter, ItemTypeFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  itemTypeValues,
  optionalValue,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { MasterLocationCell, useMasterEditing } from '@/components/master-location';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function itemToFormValues(item: Item): ItemFormValues {
  return {
    categoryId: item.categoryId,
    hospitalId: item.hospitalId ?? '',
    hsnCode: item.hsnCode ?? '',
    isActive: item.isActive,
    itemCode: item.itemCode,
    itemName: item.itemName,
    itemType: item.itemType,
    preparationTimeMinutes:
      item.preparationTimeMinutes === null ? '' : String(item.preparationTimeMinutes),
    type: item.type,
  };
}

const itemTypeTagClasses: Record<ItemType, string> = {
  LIVE: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
  MRP: 'bg-ds-tile-items-bg text-ds-tile-items-fg',
  READYMADE: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
};

const itemTypeLabels: Record<ItemType, string> = {
  LIVE: 'Live',
  MRP: 'MRP',
  READYMADE: 'Readymade',
};

const itemPageSizes = [25, 50, 100];

const itemSortOptions = [
  { label: 'Recently added', value: 'createdAt:desc' },
  { label: 'Name A–Z', value: 'itemName:asc' },
  { label: 'Name Z–A', value: 'itemName:desc' },
  { label: 'Item code', value: 'itemCode:asc' },
  { label: 'Recently updated', value: 'updatedAt:desc' },
];

function ItemTypeTag({ type }: Readonly<{ type: ItemType }>) {
  return (
    <span
      className={cn(
        'inline-flex rounded-[5px] px-[7px] py-0.5 text-[11px] font-bold uppercase tracking-[0.04em]',
        itemTypeTagClasses[type],
      )}
    >
      {type}
    </span>
  );
}

export function ItemsPageClient() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  // Search, filters, sort, page size, page and the open item all live in the URL.
  const [page, setPage] = useUrlNumberParam('page');
  const [rows, setPageSize] = useUrlNumberParam('rows', 25);
  const pageSize = itemPageSizes.includes(rows) ? rows : 25;
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [categoryFilter, setCategoryFilter] = useUrlParam('category');
  const [foodTypeFilter, setFoodTypeFilter] = useUrlParam<FoodTypeFilter>(
    'food',
    '',
    foodTypeValues,
  );
  const [itemTypeFilter, setItemTypeFilter] = useUrlParam<ItemTypeFilter>(
    'type',
    '',
    itemTypeValues,
  );
  const [sort, setSort] = useUrlParam(
    'sort',
    'createdAt:desc',
    itemSortOptions.map((option) => option.value),
  );
  const [sortBy = 'createdAt', sortDirection] = sort.split(':');
  const sortOrder: SortOrder = sortDirection === 'asc' ? 'asc' : 'desc';
  const hrefWith = useHrefWith();
  const [isEditing, setIsEditing] = useState(false);
  // The open item lives in the URL (?id=), so links from the palette land on it.
  const selectedItemId = searchParams.get('id');
  const categoryOptionsQuery = useItemCategoryOptions(scopedHospitalId);
  const { canEdit } = useMasterEditing();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const form = useForm<ItemFormValues>({
    defaultValues: emptyItemFormValues(),
  });
  const formCategoriesQuery = useItemCategoryOptions(form.watch('hospitalId'));

  const itemsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        categoryId: categoryFilter || undefined,
        hospitalId: scopedHospitalId,
        isActive: activeFilterToBoolean(activeFilter),
        itemType: itemTypeFilter || undefined,
        limit: pageSize,
        page,
        search,
        sortBy,
        sortOrder,
        type: foodTypeFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.items({
      activeFilter,
      categoryFilter,
      foodTypeFilter,
      itemTypeFilter,
      page,
      pageSize,
      scope: scopedHospitalId ?? 'all',
      search,
      sortBy,
      sortOrder,
    }),
  });

  // Today's base Normal price per item, for the price column.
  // ponytail: first 100 prices; a per-item price field on the list if catalogues outgrow it.
  const normalPricesQuery = useQuery({
    enabled: hasPermission('ITEM_PRICE_VIEW'),
    queryFn: async () =>
      (
        await organizationApi.listItemPrices({
          effectiveDate: todayValue(),
          hospitalId: scopedHospitalId,
          isActive: true,
          limit: 100,
          rateType: 'NORMAL',
        })
      ).data.items,
    queryKey: queryKeys.itemPricesNormal(scopedHospitalId ?? 'all'),
  });
  const normalPrices = new Map<string, number[]>();

  (normalPricesQuery.data ?? [])
    .filter((price) => !price.restaurantId)
    .forEach((price) =>
      normalPrices.set(price.itemId, [...(normalPrices.get(price.itemId) ?? []), price.price]),
    );

  const items = itemsQuery.data?.items ?? [];
  const meta = itemsQuery.data?.meta ?? { limit: pageSize, page, total: 0, totalPages: 1 };
  const listedItem = items.find((item) => item.id === selectedItemId);
  const linkedItemQuery = useQuery({
    enabled: Boolean(selectedItemId) && !listedItem && !itemsQuery.isLoading,
    queryFn: async () => (await organizationApi.getItem(selectedItemId ?? '')).data,
    queryKey: queryKeys.items('detail', selectedItemId),
    retry: false,
  });
  const selectedItem = listedItem ?? linkedItemQuery.data;
  useBreadcrumbLabel(
    selectedItemId,
    selectedItem?.itemName ?? (linkedItemQuery.isError ? 'Not found' : undefined),
  );

  useEffect(() => {
    setIsEditing(false);
  }, [selectedItemId]);

  // On narrow screens the panel sits under the list; bring it into view when opened.
  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const panel = document.getElementById('item-detail-panel');

    if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedItem]);

  const saveItemMutation = useMutation({
    mutationFn: (body: ItemInput) =>
      selectedItem
        ? organizationApi.updateItem(selectedItem.id, body)
        : organizationApi.createItem(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarItemError) {
        form.setError('itemName', { message });
      }

      showToast({
        description: message,
        title: 'Item was not updated',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemQueries(queryClient);
      showToast({ title: 'Item updated', variant: 'success' });
      setIsEditing(false);
    },
  });

  const toggleItemStatusMutation = useMutation({
    mutationFn: ({ isActive, item }: { isActive: boolean; item: Item }) =>
      organizationApi.updateItem(item.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Item status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateItemQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Item activated' : 'Item marked inactive',
        variant: 'success',
      });
    },
  });

  useEffect(() => itemSchemaLoader.warm(), []);

  const handleSubmit = form.handleSubmit(async (values) => {
    const parsed = (await itemSchemaLoader.get()).safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveItemMutation.mutate({
      categoryId: parsed.data.categoryId,
      hospitalId: parsed.data.hospitalId || null,
      hsnCode: optionalValue(parsed.data.hsnCode),
      isActive: parsed.data.isActive,
      itemName: parsed.data.itemName,
      itemType: parsed.data.itemType,
      preparationTimeMinutes: parsed.data.preparationTimeMinutes,
      type: parsed.data.type,
    });
  });

  function closeItem() {
    const id = selectedItemId;
    setUrlParams({ id: null });
    window.requestAnimationFrame(() => document.getElementById(`item-open-${id}`)?.focus());
  }

  function startEditing(item: Item) {
    form.reset(itemToFormValues(item));
    setIsEditing(true);
  }

  function toggleItemStatus(item: Item) {
    const nextIsActive = !item.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this item inactive will prevent it from being used in new operations. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleItemStatusMutation.mutate({ isActive: nextIsActive, item });
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setCategoryFilter('');
    setFoodTypeFilter('');
    setItemTypeFilter('');
    setPage(1);
  }

  const hasFilters = Boolean(
    search || activeFilter || categoryFilter || foodTypeFilter || itemTypeFilter,
  );
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);

  function priceText(itemId: string): { text: string; title?: string } {
    const prices = [...new Set(normalPrices.get(itemId) ?? [])].sort((left, right) => left - right);
    const [lowest] = prices;

    if (lowest === undefined) {
      return { text: '—' };
    }

    return prices.length === 1
      ? { text: rupees.format(lowest) }
      : { text: `${rupees.format(lowest)}+`, title: 'Varies by location' };
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-ds-text">Items</h1>
          <p className="text-[13.5px] text-ds-muted">
            One catalogue for every store, kitchen and restaurant. Prices are set per rate type.
          </p>
        </div>
        <IfCanOpen href="/masters/items/new">
          <Button asChild>
            <Link href="/masters/items/new">
              <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              New item
            </Link>
          </Button>
        </IfCanOpen>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-label="Item list"
          className="min-w-0 flex-[1_1_560px] overflow-hidden"
          role="region"
        >
          <FilterBar>
            <FilterSearch
              label="Search items"
              onChange={(value) => changeFilter(() => setSearch(value))}
              placeholder="Search name or code"
              value={searchInput}
            />
            <SegmentedControl<FoodTypeFilter>
              label="Food type"
              onChange={(value) => changeFilter(() => setFoodTypeFilter(value))}
              options={[
                { label: 'All', value: '' },
                { label: 'Veg', value: 'VEG' },
                { label: 'Non-veg', value: 'NON_VEG' },
                { label: 'Egg', value: 'EGGETARIAN' },
              ]}
              value={foodTypeFilter}
            />
            <FilterSelect
              label="Type"
              onChange={(value) => changeFilter(() => setItemTypeFilter(value as ItemTypeFilter))}
              value={itemTypeFilter}
            >
              <option value="">All</option>
              {itemTypeValues.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {itemTypeLabels[itemType]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Category"
              onChange={(value) => changeFilter(() => setCategoryFilter(value))}
              value={categoryFilter}
            >
              <option value="">All</option>
              {(categoryOptionsQuery.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.categoryName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Status"
              onChange={(value) => changeFilter(() => setActiveFilter(value as ActiveFilter))}
              value={activeFilter}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </FilterSelect>
            <FilterSelect
              label="Sort"
              onChange={(value) => changeFilter(() => setSort(value))}
              value={sort}
            >
              {itemSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FilterSelect>
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] table-fixed text-[13px]">
              <thead className="border-b border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Item</th>
                  <th className="w-[130px] px-3 py-2.5 font-semibold">Category</th>
                  <th className="w-[120px] px-3 py-2.5 font-semibold">Location</th>
                  <th className="w-[108px] px-3 py-2.5 font-semibold">Type</th>
                  <th className="w-[84px] px-3 py-2.5 text-right font-semibold">Normal</th>
                  <th className="w-[118px] px-3 py-2.5 pr-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {itemsQuery.isLoading ? (
                  Array.from({ length: 6 }, (_, index) => (
                    <tr className="border-b border-ds-divider" key={`item-skeleton-${index}`}>
                      <td className="px-4 py-3" colSpan={6}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : itemsQuery.isError ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-sm font-medium text-ds-status-bad-fg"
                      colSpan={6}
                    >
                      {getApiErrorMessage(itemsQuery.error)}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="p-4" colSpan={6}>
                      <EmptyState
                        action={
                          hasFilters ? (
                            <Button onClick={clearFilters} type="button" variant="outline">
                              Clear filters
                            </Button>
                          ) : undefined
                        }
                        description={
                          hasFilters
                            ? 'Try another name or clear the food-type filter.'
                            : 'Create the first item to start the catalogue.'
                        }
                        title={hasFilters ? 'No items match' : 'No items yet'}
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isSelected = item.id === selectedItem?.id;
                    const price = priceText(item.id);

                    return (
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-ds-divider transition',
                          isSelected ? 'bg-ds-selected' : 'hover:bg-ds-subtle',
                        )}
                        key={item.id}
                        onClick={openRowLink}
                      >
                        <td className="px-4 py-1.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <FoodTypeMarker type={item.type} />
                            <span className="flex min-w-0 flex-col">
                              <Link
                                aria-current={isSelected ? 'true' : undefined}
                                className={cn(
                                  'truncate rounded-sm text-left text-[13.5px] font-bold hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                                  isSelected ? 'text-ds-link' : 'text-ds-text',
                                )}
                                data-row-link=""
                                href={hrefWith({ id: item.id })}
                                id={`item-open-${item.id}`}
                                prefetch={false}
                                scroll={false}
                              >
                                {item.itemName}
                              </Link>
                              <span className="truncate text-[11.5px] tabular-nums text-ds-muted">
                                {item.itemCode}
                                {item.hsnCode ? ` · HSN ${item.hsnCode}` : ''}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="truncate px-3 py-1.5 text-[12.5px] text-ds-text-2">
                          {item.category.categoryName}
                        </td>
                        <td className="truncate px-3 py-1.5 text-[12.5px]">
                          <MasterLocationCell hospital={item.hospital} />
                        </td>
                        <td className="px-3 py-1.5">
                          <ItemTypeTag type={item.itemType} />
                        </td>
                        <td
                          className="px-3 py-1.5 text-right font-bold tabular-nums text-ds-text"
                          title={price.title}
                        >
                          {price.text}
                        </td>
                        <td
                          className="px-3 py-1.5 pr-4"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="flex items-center gap-2">
                            <Toggle
                              ariaLabel={`${item.itemName} active`}
                              checked={item.isActive}
                              disabled={toggleItemStatusMutation.isPending || !canEdit(item)}
                              onChange={() => toggleItemStatus(item)}
                            />
                            <span
                              className={cn(
                                'text-xs font-bold',
                                item.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                              )}
                            >
                              {item.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-ds-muted">
            <span>
              Showing{' '}
              <strong className="font-bold text-ds-text">
                {firstRow}–{lastRow}
              </strong>{' '}
              of {plural(meta.total, 'item')}
            </span>
            <span className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5">
                Rows
                <select
                  className="h-[30px] rounded-[7px] border border-ds-border bg-ds-surface px-1.5 text-[12.5px] font-bold text-ds-text"
                  onChange={(event) => changeFilter(() => setPageSize(Number(event.target.value)))}
                  value={pageSize}
                >
                  {itemPageSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                aria-label="Previous page"
                className="h-[30px] w-[30px]"
                disabled={meta.page <= 1}
                onClick={() => setPage(meta.page - 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
              <Button
                aria-label="Next page"
                className="h-[30px] w-[30px]"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
            </span>
          </div>
        </Panel>

        {selectedItemId ? (
          selectedItem ? (
            <DetailPanel
              className="min-w-[300px] flex-[0_1_400px]"
              footer={
                isEditing || !canEdit(selectedItem) ? undefined : (
                  <Button
                    className="flex-1"
                    onClick={() => startEditing(selectedItem)}
                    type="button"
                    variant="outline"
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                    Edit details
                  </Button>
                )
              }
              id="item-detail-panel"
              label={`${selectedItem.itemName} details`}
              meta={`${selectedItem.itemCode} · ${selectedItem.category.categoryName} · ${itemTypeLabels[selectedItem.itemType]}`}
              onClose={closeItem}
              status={selectedItem.isActive ? null : <Badge>Inactive</Badge>}
              title={
                <span className="flex items-center gap-2">
                  <FoodTypeMarker type={selectedItem.type} />
                  {selectedItem.itemName}
                </span>
              }
            >
              {isEditing ? (
                <form
                  className="grid gap-4 px-[18px] py-4"
                  onSubmit={(event) => {
                    void handleSubmit(event);
                  }}
                >
                  <ItemFormFields categories={formCategoriesQuery.data} form={form} />
                  {formCategoriesQuery.isError ? (
                    <p className="text-sm font-medium text-ds-status-bad-fg">
                      {getApiErrorMessage(formCategoriesQuery.error)}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 border-t border-ds-divider pt-4">
                    <Button onClick={() => setIsEditing(false)} type="button" variant="outline">
                      Cancel
                    </Button>
                    <SubmitButton isPending={saveItemMutation.isPending} label="Save item" />
                  </div>
                </form>
              ) : (
                <ItemDetailTabs item={selectedItem} key={selectedItem.id} />
              )}
            </DetailPanel>
          ) : (
            <Panel className="min-w-[300px] flex-[0_1_400px] p-4">
              {linkedItemQuery.isError ? (
                <EmptyState
                  action={
                    <Button
                      onClick={() => setUrlParams({ id: null })}
                      type="button"
                      variant="outline"
                    >
                      Close
                    </Button>
                  }
                  description="It may have been deleted."
                  title="Item not found"
                />
              ) : (
                <LoadingRows />
              )}
            </Panel>
          )
        ) : null}
      </div>
    </section>
  );
}
