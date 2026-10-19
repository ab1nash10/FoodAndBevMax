'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Item, ItemInput, SortOrder } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { FilterField, FiltersMenu, ListToolbar } from '@/components/list-toolbar';
import { EmptyState, FoodTypeMarker } from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Panel, Select, Skeleton } from '@/components/ui';
import {
  FilterSearch,
  FilterSelect,
  Modal,
  SegmentedControl,
  Toggle,
} from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { IfCanOpen } from '@/components/record-link';
import {
  setUrlParams,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { invalidateItemQueries } from '@/lib/query-invalidation';
import { ItemDetails } from '@/components/master-data/items/item-details';
import {
  ItemFormFields,
  LoadingRows,
  emptyItemFormValues,
  foodTypeFormLabels,
  foodTypeValues,
  similarItemError,
  unmappedTwinError,
  type FoodTypeFilter,
  type ItemFormValues,
  itemSchemaLoader,
} from '@/components/master-data/items/shared';
import { SubmitButton } from '@/components/master-data/shared/components';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  formatDateOnly,
  optionalValue,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function itemToFormValues(item: Item): ItemFormValues {
  return {
    hsnCode: item.hsnCode ?? '',
    isActive: item.isActive,
    itemCode: item.itemCode,
    itemName: item.itemName,
    preparationTimeMinutes:
      item.preparationTimeMinutes === null ? '' : String(item.preparationTimeMinutes),
    type: item.type,
  };
}

const itemPageSizes = [25, 50, 100];

const itemSortOptions = [
  { label: 'Newest', value: 'createdAt:desc' },
  { label: 'Name A–Z', value: 'itemName:asc' },
  { label: 'Name Z–A', value: 'itemName:desc' },
  { label: 'Item code', value: 'itemCode:asc' },
  { label: 'Last updated', value: 'updatedAt:desc' },
];

export function ItemsPageClient() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
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
  const [foodTypeFilter, setFoodTypeFilter] = useUrlParam<FoodTypeFilter>(
    'food',
    '',
    foodTypeValues,
  );
  const [sort, setSort] = useUrlParam(
    'sort',
    'createdAt:desc',
    itemSortOptions.map((option) => option.value),
  );
  const [sortBy = 'createdAt', sortDirection] = sort.split(':');
  const sortOrder: SortOrder = sortDirection === 'asc' ? 'asc' : 'desc';
  const [isEditing, setIsEditing] = useState(false);
  // The open item lives in the URL (?id=), so links from the palette open its pop-up.
  const selectedItemId = searchParams.get('id');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const form = useForm<ItemFormValues>({
    defaultValues: emptyItemFormValues(),
  });

  const itemsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        isActive: activeFilterToBoolean(activeFilter),
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
      foodTypeFilter,
      page,
      pageSize,
      search,
      sortBy,
      sortOrder,
    }),
  });

  const items = itemsQuery.data?.items ?? [];
  const meta = itemsQuery.data?.meta ?? { limit: pageSize, page, total: 0, totalPages: 1 };
  const listedItem = items.find((item) => item.id === selectedItemId);
  const linkedItemQuery = useQuery({
    enabled: Boolean(selectedItemId) && !listedItem && !itemsQuery.isLoading,
    queryFn: async () => (await organizationApi.getItem(selectedItemId ?? '')).data,
    queryKey: queryKeys.items('detail', selectedItemId),
  });
  const selectedItem = listedItem ?? linkedItemQuery.data;
  useBreadcrumbLabel(
    selectedItemId,
    selectedItem?.itemName ?? (linkedItemQuery.isError ? 'Not found' : undefined),
  );

  const saveItemMutation = useMutation({
    mutationFn: (body: ItemInput) =>
      selectedItem
        ? organizationApi.updateItem(selectedItem.id, body)
        : organizationApi.createItem(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarItemError || message === unmappedTwinError) {
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
      closeItem();
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
      hsnCode: optionalValue(parsed.data.hsnCode),
      isActive: parsed.data.isActive,
      itemName: parsed.data.itemName,
      preparationTimeMinutes: parsed.data.preparationTimeMinutes,
      type: parsed.data.type,
    });
  });

  function closeItem() {
    const id = selectedItemId;
    setUrlParams({ id: null });
    setIsEditing(false);
    window.requestAnimationFrame(() => document.getElementById(`item-edit-${id}`)?.focus());
  }

  function editItem(item: Item) {
    form.reset(itemToFormValues(item));
    setIsEditing(true);
    setUrlParams({ id: item.id });
  }

  const canEditItems = hasPermission('ITEM_UPDATE');

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
    setFoodTypeFilter('');
    setPage(1);
  }

  const hasFilters = Boolean(searchInput || activeFilter || foodTypeFilter);
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);

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
          <ListToolbar>
            <FilterSearch
              label="Search items"
              onChange={(value) => changeFilter(() => setSearch(value))}
              placeholder="Name or code"
              value={searchInput}
            />
            <FiltersMenu activeCount={[activeFilter, foodTypeFilter].filter(Boolean).length}>
              <FilterField label="Status">
                <Select
                  onChange={(event) =>
                    changeFilter(() => setActiveFilter(event.target.value as ActiveFilter))
                  }
                  value={activeFilter}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </FilterField>
              <FilterField group label="Food type">
                <SegmentedControl<FoodTypeFilter>
                  // Same 36px height as the search and selects beside it.
                  className="p-0.5 [&>button]:h-7.5"
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
              </FilterField>
            </FiltersMenu>
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
            <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
          </ListToolbar>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-[13px]">
              <thead className="border-b border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                <tr>
                  <th className="w-[28%] px-4 py-2.5 font-semibold">Item</th>
                  <th className="w-[12%] px-3 py-2.5 font-semibold">Food type</th>
                  <th className="w-[12%] px-3 py-2.5 font-semibold">HSN code</th>
                  <th className="w-[11%] px-3 py-2.5 font-semibold">Prep time</th>
                  <th className="w-[15%] px-3 py-2.5 font-semibold">Last updated</th>
                  <th className="w-[14%] px-3 py-2.5 font-semibold">Status</th>
                  <th className="w-[8%] px-3 py-2.5 pr-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {itemsQuery.isLoading ? (
                  Array.from({ length: 6 }, (_, index) => (
                    <tr className="border-b border-ds-divider" key={`item-skeleton-${index}`}>
                      <td className="px-4 py-3" colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : itemsQuery.isError ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-sm font-medium text-ds-status-bad-fg"
                      colSpan={7}
                    >
                      {getApiErrorMessage(itemsQuery.error)}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="p-4" colSpan={7}>
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
                    return (
                      <tr className="border-b border-ds-divider" key={item.id}>
                        <td className="px-4 py-1.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <FoodTypeMarker type={item.type} />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-[13.5px] font-bold text-ds-text">
                                {item.itemName}
                              </span>
                              <span className="truncate text-[11.5px] tabular-nums text-ds-muted">
                                {item.itemCode}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="truncate px-3 py-1.5 text-ds-text-2">
                          {foodTypeFormLabels[item.type]}
                        </td>
                        <td className="truncate px-3 py-1.5 tabular-nums text-ds-text-2">
                          {item.hsnCode || '—'}
                        </td>
                        <td className="truncate px-3 py-1.5 tabular-nums text-ds-text-2">
                          {item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : '—'}
                        </td>
                        <td className="truncate px-3 py-1.5 text-[12.5px] text-ds-muted">
                          {formatDateOnly(item.updatedAt)}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-2">
                            <Toggle
                              ariaLabel={`${item.itemName} active`}
                              checked={item.isActive}
                              disabled={toggleItemStatusMutation.isPending}
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
                        <td className="px-3 py-1.5 pr-4">
                          <span className="flex justify-end gap-2">
                            {canEditItems ? (
                              <Button
                                aria-label={`Edit ${item.itemName}`}
                                className="h-9 w-9"
                                id={`item-edit-${item.id}`}
                                onClick={() => editItem(item)}
                                size="icon"
                                title="Edit"
                                type="button"
                                variant="outline"
                              >
                                <Pencil aria-hidden="true" className="h-4 w-4" />
                              </Button>
                            ) : null}
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
      </div>

      <Modal
        footer={
          selectedItem && !isEditing && canEditItems ? (
            <Button onClick={() => editItem(selectedItem)} type="button" variant="outline">
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit details
            </Button>
          ) : undefined
        }
        onClose={closeItem}
        open={Boolean(selectedItemId)}
        title={
          selectedItem
            ? `${isEditing ? 'Edit ' : ''}${selectedItem.itemName}`
            : linkedItemQuery.isError
              ? 'Item not found'
              : 'Item'
        }
      >
        {selectedItem ? (
          isEditing ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
            >
              <ItemFormFields form={form} />
              <div className="flex justify-end gap-3 border-t border-ds-divider pt-4">
                <Button onClick={() => setIsEditing(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <SubmitButton isPending={saveItemMutation.isPending} label="Save item" />
              </div>
            </form>
          ) : (
            <ItemDetails item={selectedItem} />
          )
        ) : linkedItemQuery.isError ? (
          <EmptyState description="It may have been deleted." title="Item not found" />
        ) : (
          <LoadingRows />
        )}
      </Modal>
    </section>
  );
}
