'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Item, ItemInput, ItemType, SortOrder } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { ImportButton } from '@/components/import/import-dialog';
import { itemImport } from '@/components/import/import-definitions';
import { CsvImportExport, fetchAllPages, type CsvColumn } from '@/components/csv-import-export';
import { FilterField, FiltersMenu, ListToolbar, SortControl } from '@/components/list-toolbar';
import {
  AppPageHeader,
  EmptyState,
  FoodTypeMarker,
  ListPager,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Panel, Select, Skeleton } from '@/components/ui';
import { FilterSearch, Modal, SegmentedControl, Toggle } from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { LoadError } from '@/components/location-empty-states';
import { IfCanOpen } from '@/components/record-link';
import {
  setUrlParams,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { useUndoable } from '@/lib/use-undoable';
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
import { sortChoices } from '@/lib/sort-choices';

const itemKinds: Record<ItemType, { className: string; label: string }> = {
  LIVE: { className: 'bg-ds-status-neutral-bg text-ds-status-neutral-fg', label: 'Live' },
  MRP: { className: 'bg-ds-status-info-bg text-ds-status-info-fg', label: 'Packaged' },
  READYMADE: { className: 'bg-ds-primary-soft text-ds-link', label: 'Prepared' },
};

/** Packaged (mapped to a store), prepared (to a kitchen), or not mapped yet. */
function ItemKind({ kind }: Readonly<{ kind: ItemType | null }>) {
  const shown = kind ? itemKinds[kind] : null;

  return shown ? (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium',
        shown.className,
      )}
    >
      {shown.label}
    </span>
  ) : (
    <span className="text-[13px] text-ds-muted">Not mapped</span>
  );
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

const itemSortFields = [
  { label: 'Created date', value: 'createdAt' },
  { label: 'Name', value: 'itemName' },
  { label: 'Item code', value: 'itemCode' },
  { label: 'Updated date', value: 'updatedAt' },
];

const itemColumns: Array<CsvColumn<Item>> = [
  { header: 'Item code', value: (item) => item.itemCode },
  { header: 'Item name', value: (item) => item.itemName },
  { header: 'Food type', value: (item) => foodTypeFormLabels[item.type] },
  { header: 'HSN code', value: (item) => item.hsnCode },
  { header: 'Prep time (min)', value: (item) => item.preparationTimeMinutes },
  { header: 'Status', value: (item) => (item.isActive ? 'Active' : 'Inactive') },
  {
    header: 'Type',
    readOnly: true,
    value: (item) =>
      item.itemType === 'MRP'
        ? 'Packaged (stores)'
        : item.itemType === 'READYMADE'
          ? 'Prepared (kitchens)'
          : 'Not mapped yet',
  },
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
  // Packaged (mapped to a store) or prepared (mapped to a kitchen): the stat strip's filter.
  const [kindFilter, setKindFilter] = useUrlParam<'' | 'MRP' | 'READYMADE'>('kind', '', [
    'MRP',
    'READYMADE',
  ]);
  const [sort, setSort] = useUrlParam(
    'sort',
    'createdAt:desc',
    sortChoices(itemSortFields).map((choice) => choice.value),
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
        itemType: kindFilter || undefined,
        type: foodTypeFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.items({
      activeFilter,
      foodTypeFilter,
      kindFilter,
      page,
      pageSize,
      search,
      sortBy,
      sortOrder,
    }),
  });

  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (query: { isActive?: boolean; itemType?: ItemType }) =>
        (await organizationApi.listItems({ ...query, limit: 0 })).data.meta.total;
      const [all, packaged, prepared, inactive] = await Promise.all([
        count({}),
        count({ itemType: 'MRP' }),
        count({ itemType: 'READYMADE' }),
        count({ isActive: false }),
      ]);

      return { all, inactive, packaged, prepared };
    },
    queryKey: queryKeys.items('stats'),
  });
  const stats = statsQuery.data;
  const undoable = useUndoable();
  // An item marked inactive shows so at once, while its Undo toast runs.
  const items = (itemsQuery.data?.items ?? []).map((item) =>
    undoable.isChanged(item.id) ? { ...item, isActive: false } : item,
  );
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
      // Marking inactive already had its Undo toast.
      if (variables.isActive) showToast({ title: 'Item activated', variant: 'success' });
    },
  });

  useEffect(() => itemSchemaLoader.warm(), []);

  const handleSubmit = form.handleSubmit(async (values) => {
    const parsed = (await itemSchemaLoader.get()).safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    // Blank optional fields are sent as null, so an edit can clear them.
    saveItemMutation.mutate({
      hsnCode: optionalValue(parsed.data.hsnCode) ?? null,
      isActive: parsed.data.isActive,
      itemName: parsed.data.itemName,
      preparationTimeMinutes: parsed.data.preparationTimeMinutes ?? null,
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
    // Switching it back on while the Undo toast runs is the same as Undo.
    if (undoable.undo(item.id)) return;

    if (item.isActive) {
      undoable.schedule({
        commit: () => toggleItemStatusMutation.mutateAsync({ isActive: false, item }),
        description: 'It can’t be used in new operations. Existing records stay visible.',
        id: item.id,
        title: `${item.itemName} marked inactive`,
      });
      return;
    }

    toggleItemStatusMutation.mutate({ isActive: true, item });
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setFoodTypeFilter('');
    setKindFilter('');
    setPage(1);
  }

  const hasFilters = Boolean(searchInput || activeFilter || foodTypeFilter || kindFilter);

  /** A stat's filter alone: the kind or the inactive status, the other cleared. */
  function showOnly(kind: '' | 'MRP' | 'READYMADE', status: ActiveFilter) {
    changeFilter(() => {
      setKindFilter(kind);
      setActiveFilter(status);
    });
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <>
            <CsvImportExport
              columns={itemColumns}
              exportRows={() =>
                fetchAllPages((exportPage) =>
                  organizationApi.listItems({
                    isActive: activeFilterToBoolean(activeFilter),
                    limit: 100,
                    page: exportPage,
                    search,
                    sortBy,
                    sortOrder,
                    itemType: kindFilter || undefined,
                    type: foodTypeFilter || undefined,
                  }),
                )
              }
              filename="items"
              noun="items"
              onImported={() => invalidateItemQueries(queryClient)}
            />
            <ImportButton definition={itemImport} />
            <IfCanOpen href="/masters/items/new">
              <Button asChild>
                <Link href="/masters/items/new">
                  <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                  New item
                </Link>
              </Button>
            </IfCanOpen>
          </>
        }
        count={stats?.all}
        description="One catalogue for every store, kitchen and restaurant. Prices are set per rate type."
        title="Items"
      />

      <StatStrip
        label="Items at a glance"
        stats={[
          {
            active: !kindFilter && activeFilter !== 'inactive',
            label: 'All items',
            onSelect: () => showOnly('', ''),
            value: stats?.all ?? '–',
          },
          {
            active: kindFilter === 'MRP',
            label: 'Packaged · in stores',
            onSelect: () => showOnly('MRP', ''),
            value: stats?.packaged ?? '–',
          },
          {
            active: kindFilter === 'READYMADE',
            label: 'Prepared · in kitchens',
            onSelect: () => showOnly('READYMADE', ''),
            value: stats?.prepared ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive',
            onSelect: () => showOnly('', 'inactive'),
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />

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
              placeholder="Name, code or HSN"
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
            <SortControl
              onChange={(field, order) => changeFilter(() => setSort(`${field}:${order}`))}
              options={itemSortFields}
              order={sortOrder}
              sortBy={sortBy}
            />
            <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
          </ListToolbar>

          <div className="overflow-x-auto">
            <table className={cn(tableStyles.table, 'min-w-[820px] table-fixed')}>
              <thead className={tableStyles.head}>
                <tr>
                  <th className={cn(tableStyles.th, 'w-[32%]')}>Item</th>
                  <th className={cn(tableStyles.th, 'w-[15%]')}>Type</th>
                  <th className={cn(tableStyles.th, 'w-[13%]')}>HSN code</th>
                  <th className={cn(tableStyles.th, 'w-[10%]')}>Prep time</th>
                  <th className={cn(tableStyles.th, 'w-[12%]')}>Updated</th>
                  <th className={cn(tableStyles.th, 'w-[13%]')}>Status</th>
                  <th className={cn(tableStyles.th, 'w-[5%]')}>
                    <span className="sr-only">Actions</span>
                  </th>
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
                    <td className="px-4 py-8" colSpan={7}>
                      <LoadError error={itemsQuery.error} />
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
                      <tr
                        className={cn(tableStyles.row, !canEditItems && 'cursor-default')}
                        key={item.id}
                        onClick={canEditItems ? () => editItem(item) : undefined}
                      >
                        <td className={tableStyles.td}>
                          <span className="flex min-w-0 items-center gap-3">
                            <FoodTypeMarker type={item.type} />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className={cn('truncate', tableStyles.title)}>
                                {item.itemName}
                              </span>
                              <span className={cn('truncate', tableStyles.code)}>
                                {item.itemCode}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className={tableStyles.td}>
                          <ItemKind kind={item.itemType} />
                        </td>
                        <td
                          className={cn(tableStyles.td, tableStyles.num, 'truncate text-ds-text-2')}
                        >
                          {item.hsnCode || '—'}
                        </td>
                        <td
                          className={cn(tableStyles.td, tableStyles.num, 'truncate text-ds-text-2')}
                        >
                          {item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : '—'}
                        </td>
                        <td className={cn(tableStyles.td, 'truncate text-ds-muted')}>
                          {formatDateOnly(item.updatedAt)}
                        </td>
                        {/* Its own click: switching the status does not open the item. */}
                        <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
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
                        <td className={cn(tableStyles.td, 'pr-3')}>
                          <span className="flex justify-end">
                            {canEditItems ? (
                              <RowAction
                                icon={Pencil}
                                id={`item-edit-${item.id}`}
                                label={`Edit ${item.itemName}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  editItem(item);
                                }}
                              />
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
          <ListPager
            limit={meta.limit}
            noun="item"
            onLimitChange={(size) => changeFilter(() => setPageSize(size))}
            onPageChange={setPage}
            page={meta.page}
            pageSizes={itemPageSizes}
            total={meta.total}
            totalPages={meta.totalPages}
          />
        </Panel>
      </div>

      <Modal
        side
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
