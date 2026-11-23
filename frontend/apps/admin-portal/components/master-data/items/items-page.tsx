'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, PowerOff } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Item, ItemInput, ItemType, SortOrder } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { useConfirm } from '@/components/confirm-provider';
import { ImportButton } from '@/components/import/import-dialog';
import { itemImport } from '@/components/import/import-definitions';
import { CsvImportExport, fetchAllPages, type CsvColumn } from '@/components/csv-import-export';
import { FilterField, FiltersMenu, ListToolbar, SortControl } from '@/components/list-toolbar';
import {
  AppPageHeader,
  EmptyState,
  FoodTypeMarker,
  ListPager,
  RecordAvatar,
  tableStyles,
} from '@/components/design-system';
import { ListViewSwitch, RecordCard, RecordCardGrid, useListView } from '@/components/record-cards';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { BulkActionBar, FilterSearch, Modal, SegmentedControl } from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { FoodArt } from '@/components/food-art';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { LoadError } from '@/components/location-empty-states';
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
import { pageSizes } from '@/lib/list-limit';
import { sortChoices } from '@/lib/sort-choices';

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

// The usual sizes; Items opens at 25.
const itemPageSizes = pageSizes;

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
];

/** Where an item is made: the Item type filter's choices. */
const madeViews: Record<ItemType, string> = {
  LIVE: 'Live counter',
  MRP: 'Store items',
  READYMADE: 'Readymade',
};
const madeFilterValues = ['LIVE', 'READYMADE', 'MRP'] as const;
type MadeFilter = '' | ItemType;

/** An item's state in words, a dot before it: the table shows it, the bulk bar changes it. */
function ItemStatus({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
        isActive
          ? 'bg-ds-status-ok-bg text-ds-status-ok-fg'
          : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

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
  // Where the items are made (Live counter, Readymade, store), the list's views.
  const [madeFilter, setMadeFilter] = useUrlParam<MadeFilter>('made', '', madeFilterValues);
  const [foodTypeFilter, setFoodTypeFilter] = useUrlParam<FoodTypeFilter>(
    'food',
    '',
    foodTypeValues,
  );
  const [sort, setSort] = useUrlParam(
    'sort',
    'createdAt:desc',
    sortChoices(itemSortFields).map((choice) => choice.value),
  );
  const [sortBy = 'createdAt', sortDirection] = sort.split(':');
  const sortOrder: SortOrder = sortDirection === 'asc' ? 'asc' : 'desc';
  // A list (the default) or cards; in the URL like the filters, so a reload keeps it.
  const [view, setView] = useListView('list');
  const [isEditing, setIsEditing] = useState(false);
  // Rows ticked for a bulk action; only those on the page shown count.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
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
        itemType: madeFilter || undefined,
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
      madeFilter,
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
      return { all: await count({}) };
    },
    queryKey: queryKeys.items('stats'),
  });
  const stats = statsQuery.data;
  const confirm = useConfirm();
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

      if (message === similarItemError) {
        form.setError('itemName', { message });
      }

      showToast({
        description: message,
        title: 'Item was not updated',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateItemQueries(queryClient);
      showToast({ recordId: response.data.id, title: 'Item updated', variant: 'success' });
      closeItem();
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ isActive, picked }: { isActive: boolean; picked: Item[] }) =>
      Promise.all(picked.map((each) => organizationApi.updateItem(each.id, { isActive }))),
    onError(error) {
      invalidateItemQueries(queryClient);
      showToast({
        description: getApiErrorMessage(error),
        title: 'Some items were not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, { isActive, picked }) {
      invalidateItemQueries(queryClient);
      setCheckedIds(new Set());
      showToast({
        title: `${picked.length} ${picked.length === 1 ? 'item' : 'items'} ${isActive ? 'activated' : 'deactivated'}`,
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

  const checkedOnPage = items.filter((each) => checkedIds.has(each.id));
  const allChecked = items.length > 0 && checkedOnPage.length === items.length;

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  async function setPickedStatus(isActive: boolean) {
    const picked = checkedOnPage;
    const noun = picked.length === 1 ? 'item' : 'items';
    const confirmed = await confirm(
      isActive
        ? {
            confirmLabel: 'Activate',
            description: 'They become available again straight away.',
            icon: Power,
            title: `Activate ${picked.length} ${noun}?`,
          }
        : {
            confirmLabel: 'Deactivate',
            description: 'They can’t be used in new operations. Existing records stay visible.',
            icon: PowerOff,
            title: `Deactivate ${picked.length} ${noun}?`,
            tone: 'danger',
          },
    );

    if (confirmed) bulkStatusMutation.mutate({ isActive, picked });
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setMadeFilter('');
    setFoodTypeFilter('');
    setPage(1);
  }

  function itemEditAction(item: Item) {
    return canEditItems ? (
      <Button
        aria-label={`Edit ${item.itemName}`}
        id={`item-edit-${item.id}`}
        onClick={() => editItem(item)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
        Edit
      </Button>
    ) : null;
  }

  const hasFilters = Boolean(searchInput || activeFilter || madeFilter || foodTypeFilter);

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
                    itemType: madeFilter || undefined,
                    limit: 100,
                    page: exportPage,
                    search,
                    sortBy,
                    sortOrder,
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

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-label="Item list"
          className="min-w-0 flex-[1_1_560px] overflow-hidden"
          role="region"
        >
          {checkedOnPage.length > 0 ? (
            <BulkActionBar count={checkedOnPage.length} onClear={() => setCheckedIds(new Set())}>
              {canEditItems ? (
                <>
                  <Button
                    disabled={bulkStatusMutation.isPending}
                    onClick={() => void setPickedStatus(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Activate
                  </Button>
                  <Button
                    disabled={bulkStatusMutation.isPending}
                    onClick={() => void setPickedStatus(false)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Deactivate
                  </Button>
                </>
              ) : null}
            </BulkActionBar>
          ) : null}
          <ListToolbar>
            <FilterSearch
              label="Search items"
              onChange={(value) => changeFilter(() => setSearch(value))}
              placeholder="Name, code or HSN"
              value={searchInput}
            />
            <FiltersMenu
              activeCount={[activeFilter, madeFilter, foodTypeFilter].filter(Boolean).length}
            >
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
              <FilterField label="Item type">
                <Select
                  onChange={(event) =>
                    changeFilter(() => setMadeFilter(event.target.value as MadeFilter))
                  }
                  value={madeFilter}
                >
                  <option value="">All</option>
                  {madeFilterValues.map((made) => (
                    <option key={made} value={made}>
                      {madeViews[made]}
                    </option>
                  ))}
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
            <ListViewSwitch label="Show items as" onChange={setView} value={view} />
          </ListToolbar>

          {/* The catalogue as cards: a pastel top with the food mark and the item's initials,
              then its name, code and status. Its pencil edits the item. */}
          {itemsQuery.isLoading ? (
            <RecordCardGrid isLoading />
          ) : itemsQuery.isError ? (
            <div className="px-4 py-8">
              <LoadError error={itemsQuery.error} />
            </div>
          ) : items.length === 0 ? (
            <div className="p-4">
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
            </div>
          ) : view === 'list' ? (
            <div className="overflow-x-auto">
              <table className={cn(tableStyles.table, 'min-w-[760px]')}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={cn(tableStyles.th, 'w-12 pr-0')}>
                      <input
                        aria-label="Select all items on this page"
                        checked={allChecked}
                        className="h-4 w-4 accent-ds-primary"
                        onChange={() =>
                          setCheckedIds(
                            allChecked ? new Set() : new Set(items.map((each) => each.id)),
                          )
                        }
                        ref={(input) => {
                          if (input) {
                            input.indeterminate = checkedOnPage.length > 0 && !allChecked;
                          }
                        }}
                        type="checkbox"
                      />
                    </th>
                    <th className={cn(tableStyles.th, 'min-w-56')}>Item</th>
                    <th className={cn(tableStyles.th, 'whitespace-nowrap')}>HSN</th>
                    <th className={cn(tableStyles.th, 'whitespace-nowrap text-right')}>
                      Prep time
                    </th>
                    <th className={cn(tableStyles.th, 'whitespace-nowrap')}>Status</th>
                    <th className={cn(tableStyles.th, 'whitespace-nowrap')}>Updated</th>
                    <th className={cn(tableStyles.th, 'w-px')}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      className={cn(tableStyles.row, checkedIds.has(item.id) && 'bg-ds-selected')}
                      data-record-id={item.id}
                      key={item.id}
                    >
                      <td className={cn(tableStyles.td, 'pr-0')}>
                        <input
                          aria-label={`Select ${item.itemName}`}
                          checked={checkedIds.has(item.id)}
                          className="h-4 w-4 accent-ds-primary"
                          onChange={() => toggleChecked(item.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className={tableStyles.td}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <FoodArt
                            categoryId={item.itemName}
                            className="h-11 w-11 shrink-0 rounded-[14px]"
                            name={item.itemName}
                          />
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-1.5">
                              {item.type ? <FoodTypeMarker type={item.type} /> : null}
                              <span className="truncate text-[14.5px] font-semibold text-ds-text">
                                {item.itemName}
                              </span>
                            </span>
                            <p className={cn('mt-0.5 truncate', tableStyles.code)}>
                              {item.itemCode}
                            </p>
                          </span>
                        </span>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.code)}>
                        {item.hsnCode ?? '–'}
                      </td>
                      <td className={cn(tableStyles.td, 'text-right text-ds-text-2 tabular-nums')}>
                        {item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : '–'}
                      </td>
                      <td className={tableStyles.td}>
                        <ItemStatus isActive={item.isActive} />
                      </td>
                      <td className={cn(tableStyles.td, 'whitespace-nowrap text-ds-text-2')}>
                        {formatDateOnly(item.updatedAt)}
                      </td>
                      <td className={cn(tableStyles.td, 'pr-5 text-right')}>
                        {itemEditAction(item)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <RecordCardGrid>
              {items.map((item) => (
                <RecordCard
                  edit={
                    canEditItems
                      ? { id: `item-edit-${item.id}`, label: `Edit ${item.itemName}` }
                      : undefined
                  }
                  footer={<ItemStatus isActive={item.isActive} />}
                  foodType={item.type}
                  id={item.id}
                  key={item.id}
                  meta={
                    item.preparationTimeMinutes
                      ? `${item.preparationTimeMinutes} min prep`
                      : formatDateOnly(item.updatedAt)
                  }
                  name={item.itemName}
                  onOpen={canEditItems ? () => editItem(item) : undefined}
                  subtitle={`${item.itemCode}${item.hsnCode ? ` · HSN ${item.hsnCode}` : ''}`}
                />
              ))}
            </RecordCardGrid>
          )}
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
        leading={
          selectedItem ? (
            <RecordAvatar foodType={selectedItem.type} name={selectedItem.itemName} />
          ) : undefined
        }
        meta={
          selectedItem ? (
            <>
              <span className="rounded-md bg-ds-subtle px-2 py-0.5 font-mono text-[11.5px] text-ds-text-3">
                {selectedItem.itemCode}
              </span>
              <span
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                  selectedItem.isActive
                    ? 'bg-ds-status-ok-bg text-ds-status-ok-fg'
                    : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
                )}
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                {selectedItem.isActive ? 'Active' : 'Inactive'}
              </span>
            </>
          ) : undefined
        }
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
                <SubmitButton isPending={saveItemMutation.isPending} label="Save changes" />
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
