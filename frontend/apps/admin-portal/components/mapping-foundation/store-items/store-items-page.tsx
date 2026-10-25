'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Store as StoreIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type {
  SortOrder,
  Store,
  StoreItem,
  StoreItemInput,
  StoreItemListQuery,
} from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { confirmStatusChange, useConfirm } from '@/components/confirm-provider';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { useAuth } from '@/components/auth-provider';
import { DateTimeCell, RecordAvatar, RowAction, tableStyles } from '@/components/design-system';
import { cn } from '@/lib/utils';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { RecordLink } from '@/components/record-link';
import { locationHref, recordHref } from '@/lib/navigation';
import {
  ActiveFilterSelect,
  HospitalFilterSelect,
  keepLinkClicks,
  MappingFormFields,
  PageHeader,
  PaginationControls,
  QueryState,
  RowSwitch,
  SearchInput,
} from '@/components/mapping-foundation/shared/components';
import type { ActiveFilter, MappingFormValues } from '@/components/mapping-foundation/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  emptyMappingFormValues,
  listLimit,
  mappingSchema,
  useEntityList,
  useHospitalOptions,
  useInvalidateMappingQueries,
  useItemOptions,
} from '@/components/mapping-foundation/shared/utils';
import { useItemCategoryOptions } from '@/components/master-data/items/shared';
import { queryKeys } from '@/lib/query-keys';
import { SetupNotice, useLocationName } from '@/components/location-empty-states';

function useStoreOptions(hospitalId?: string) {
  return useQuery<Store[]>({
    queryFn: async () => {
      const response = await organizationApi.listStores({
        hospitalId: hospitalId || undefined,
        isActive: true,
        limit: 100,
        sortBy: 'storeName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.storeOptions(hospitalId ?? 'all'),
  });
}

/**
 * Inside the Item Mapping page (`embedded`) it drops its own title and shows the page's
 * Store / Kitchen tabs above the list; Create and Edit open in pop-ups.
 */
/** This store's mappings of an item, for greying out the categories it already has. */
const existingStoreMappings = {
  key: 'store-items',
  load: async (parentId: string, itemId: string) =>
    (await organizationApi.listStoreItems({ storeId: parentId, itemId, limit: 100 })).data.items,
};

export function StoreItemsPageClient({
  embedded = false,
  listTabs,
}: Readonly<{ embedded?: boolean; listTabs?: ReactNode }> = {}) {
  const { scopedHospitalId } = useLocationContext();
  const locationName = useLocationName();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [storeFilter, setStoreFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingMapping, setEditingMapping] = useState<StoreItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const form = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  // Edit has its own form in a pop-up, so the Create form above keeps what was typed in it.
  const editForm = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  const hospitalsQuery = useHospitalOptions();
  const storesQuery = useStoreOptions(hospitalFilter);
  // The whole catalogue; the form greys out items already mapped the other way.
  const itemsQuery = useItemOptions();
  const categoriesQuery = useItemCategoryOptions();
  const invalidateStoreItems = useInvalidateMappingQueries('store-items', 'store-options');
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('STORE_ITEM_UPDATE');

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setPage(1);
    form.setValue('parentId', '', { shouldValidate: true });
  }, [form, scopedHospitalId]);

  const mappingsQuery = useEntityList<StoreItem, StoreItemListQuery>(
    'store-items',
    {
      isActive: activeFilterToBoolean(activeFilter),
      hospitalId: hospitalFilter,
      itemId: itemFilter,
      limit: listLimit,
      page,
      search,
      sortBy,
      sortOrder,
      storeId: storeFilter,
    },
    (query) => organizationApi.listStoreItems(query),
  );

  const saveMappingMutation = useMutation({
    mutationFn: ({ body, id }: { body: StoreItemInput; id?: string }) =>
      id ? organizationApi.updateStoreItem(id, body) : organizationApi.createStoreItem(body),
    onError(error, variables) {
      showToast({
        description: getApiErrorMessage(error),
        title: variables.id ? 'Store item was not updated' : 'Store item was not created',
        variant: 'error',
      });
    },
    onSuccess(response, variables) {
      invalidateStoreItems();
      showToast({
        recordId: response.data.id,
        title: variables.id ? 'Store item updated' : 'Store item created',
        variant: 'success',
      });

      if (variables.id) {
        setEditingMapping(null);
      } else {
        form.reset(emptyMappingFormValues());
        setIsCreating(false);
      }
    },
  });

  const toggleMappingStatusMutation = useMutation({
    mutationFn: ({ isActive, mapping }: { isActive: boolean; mapping: StoreItem }) =>
      organizationApi.updateStoreItem(mapping.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Store item status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateStoreItems();
      showToast({
        recordId: variables.mapping.id,
        title: variables.isActive
          ? 'Store item mapping activated'
          : 'Store item mapping deactivated',
        variant: 'success',
      });
    },
  });
  const confirm = useConfirm();

  const stores =
    storesQuery.data?.map((store) => ({
      code: store.storeCode,
      id: store.id,
      name: store.storeName,
    })) ?? [];
  const mappings = mappingsQuery.data?.items ?? [];
  const meta = mappingsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  /** Submits the Create form (no id) or the Edit pop-up's form (the mapping's id). */
  const submitMapping = (target: UseFormReturn<MappingFormValues>, id?: string) =>
    target.handleSubmit((values) => {
      const parsed = mappingSchema.safeParse(values);

      if (!parsed.success) {
        applyValidationErrors(target, parsed.error);
        return;
      }

      saveMappingMutation.mutate({
        body: {
          categoryId: parsed.data.categoryId,
          isActive: parsed.data.isActive,
          itemId: parsed.data.itemId,
          storeId: parsed.data.parentId,
        },
        id,
      });
    });

  const hasFilters = Boolean(
    searchInput ||
    activeFilter ||
    hospitalFilter !== (scopedHospitalId ?? '') ||
    storeFilter ||
    itemFilter,
  );

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setItemFilter('');
    setPage(1);
  }

  function startEditingMapping(mapping: StoreItem) {
    setEditingMapping(mapping);
    editForm.reset({
      categoryId: mapping.categoryId ?? '',
      isActive: mapping.isActive,
      itemId: mapping.itemId,
      parentId: mapping.storeId,
    });
  }

  function cancelEditingMapping() {
    setEditingMapping(null);
  }

  async function toggleMappingStatus(mapping: StoreItem) {
    const isActive = !mapping.isActive;
    const confirmed = await confirmStatusChange(confirm, {
      activate: isActive,
      effect:
        'It can’t be used in new GRNs for this store. Existing stock and history stay visible.',
      name: `${mapping.item.itemName} in ${mapping.store.storeName}`,
    });

    if (confirmed) toggleMappingStatusMutation.mutate({ isActive, mapping });
  }

  return (
    <section className="space-y-5">
      {embedded ? null : (
        <PageHeader
          icon={StoreIcon}
          subtitle="Choose which packaged items each store keeps."
          title="Store Items"
        />
      )}
      <Modal
        side
        footer={
          <div className="flex justify-end gap-3">
            <Button onClick={() => setIsCreating(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saveMappingMutation.isPending} form="create-store-item" type="submit">
              {saveMappingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Store Item
            </Button>
          </div>
        }
        onClose={() => setIsCreating(false)}
        open={isCreating}
        title="Map Item to Store"
      >
        <form
          className="grid gap-4"
          id="create-store-item"
          onSubmit={(event) => {
            void submitMapping(form)(event);
          }}
        >
          <p className="text-sm text-ds-muted">
            Pick an item not mapped yet, or an MRP item: mapping it here makes it MRP and sets its
            category. A Readymade item cannot be mapped to a store.
          </p>
          {storesQuery.data?.length === 0 ? (
            <SetupNotice href="/masters/stores/new" linkLabel="Create a store">
              {locationName ? `${locationName} has no store yet` : 'There is no store yet'}, so
              there is nothing to map items to.
            </SetupNotice>
          ) : null}
          {itemsQuery.data?.length === 0 ? (
            <SetupNotice href="/masters/items/new" linkLabel="Create an item">
              There are no items to map yet.
            </SetupNotice>
          ) : null}
          <MappingFormFields
            categories={categoriesQuery.data}
            existingMappings={existingStoreMappings}
            form={form}
            itemLabel="Item"
            mapsAs="MRP"
            typeLabel="MRP"
            items={itemsQuery.data}
            parentLabel="Store"
            parents={stores}
          />
        </form>
      </Modal>
      <Modal
        side
        footer={
          <div className="flex justify-end gap-3">
            <Button onClick={cancelEditingMapping} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saveMappingMutation.isPending} form="edit-store-item" type="submit">
              {saveMappingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        }
        onClose={cancelEditingMapping}
        open={editingMapping !== null}
        title="Edit Store Item"
      >
        <form
          className="grid gap-4"
          id="edit-store-item"
          onSubmit={(event) => {
            if (editingMapping) {
              void submitMapping(editForm, editingMapping.id)(event);
            }
          }}
        >
          <MappingFormFields
            categories={categoriesQuery.data}
            editingId={editingMapping?.id}
            existingMappings={existingStoreMappings}
            form={editForm}
            itemLabel="Item"
            mapsAs="MRP"
            typeLabel="MRP"
            items={itemsQuery.data}
            parentLabel="Store"
            parents={stores}
          />
        </form>
      </Modal>
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ds-divider px-4 pt-3">
          {listTabs ?? <span />}
          <Button className="mb-2" onClick={() => setIsCreating(true)} type="button">
            <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Map item
          </Button>
        </div>
        <ListToolbar>
          <SearchInput
            label="Search store items"
            placeholder="Item name or code, category or store"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu
            activeCount={
              [
                activeFilter,
                hospitalFilter !== (scopedHospitalId ?? ''),
                storeFilter,
                itemFilter,
              ].filter(Boolean).length
            }
          >
            <FilterField label="Status">
              <ActiveFilterSelect
                onChange={(value) => {
                  setActiveFilter(value);
                  setPage(1);
                }}
                value={activeFilter}
              />
            </FilterField>
            <FilterField label="Location">
              <HospitalFilterSelect
                disabled={Boolean(scopedHospitalId)}
                hospitals={hospitalsQuery.data ?? []}
                onChange={(value) => {
                  setHospitalFilter(value);
                  setStoreFilter('');
                  setPage(1);
                }}
                value={hospitalFilter}
              />
            </FilterField>
            <FilterField label="Store">
              <Select
                onChange={(event) => {
                  setStoreFilter(event.target.value);
                  setPage(1);
                }}
                value={storeFilter}
              >
                <option value="">All stores</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Item">
              <Select
                onChange={(event) => {
                  setItemFilter(event.target.value);
                  setPage(1);
                }}
                value={itemFilter}
              >
                <option value="">All packaged items</option>
                {itemsQuery.data
                  ?.filter((item) => item.itemType === 'MRP')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.itemName}
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
              setSortBy(value);
              setPage(1);
            }}
            options={[
              { label: 'Created date', value: 'createdAt' },
              { label: 'Updated date', value: 'updatedAt' },
              { label: 'Status', value: 'isActive' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void mappingsQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'phone-cards min-w-[900px] table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[22%]')}>Item</th>
                <th className={cn(tableStyles.th, 'w-[19%]')}>Store</th>
                <th className={cn(tableStyles.th, 'w-[17%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[13%]')}>Category</th>
                <th className={cn(tableStyles.th, 'w-[11%]')}>Updated</th>
                <th className={cn(tableStyles.th, 'w-[13%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-[5%]')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.length > 0 ? (
                mappings.map((mapping) => (
                  <tr
                    className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                    data-record-id={mapping.id}
                    key={mapping.id}
                    onClick={canEdit ? () => startEditingMapping(mapping) : undefined}
                  >
                    <td className={tableStyles.td} onClick={keepLinkClicks}>
                      <span className="flex min-w-0 items-center gap-3">
                        <RecordAvatar foodType={mapping.item.type} name={mapping.item.itemName} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <RecordLink
                            className={cn('truncate', tableStyles.title)}
                            href={recordHref('/masters/items', { id: mapping.item.id })}
                          >
                            {mapping.item.itemName}
                          </RecordLink>
                          <span className={cn('truncate', tableStyles.code)}>
                            {mapping.item.itemCode}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={tableStyles.td} onClick={keepLinkClicks}>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <RecordLink
                          className="truncate font-medium text-ds-text-2"
                          href={locationHref(
                            'STORE',
                            mapping.store.storeCode || mapping.store.storeName,
                          )}
                        >
                          {mapping.store.storeName}
                        </RecordLink>
                        <span className={cn('truncate', tableStyles.code)}>
                          {mapping.store.storeCode}
                        </span>
                      </span>
                    </td>
                    <td className={tableStyles.td}>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-ds-text-2">
                          {mapping.store.hospital.hospitalName}
                        </span>
                        <span className={cn('truncate', tableStyles.code)}>
                          {mapping.store.hospital.hospitalCode}
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                      {mapping.category?.categoryName ?? '—'}
                    </td>
                    <td className={tableStyles.td}>
                      <DateTimeCell value={mapping.updatedAt} />
                    </td>
                    {/* Its own click: switching the status does not open the mapping. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <RowSwitch
                        ariaLabel={`${mapping.item.itemName} in ${mapping.store.storeName} active`}
                        checked={mapping.isActive}
                        disabled={toggleMappingStatusMutation.isPending}
                        offLabel="Inactive"
                        onChange={() => void toggleMappingStatus(mapping)}
                        onLabel="Active"
                      />
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end">
                        {canEdit ? (
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${mapping.item.itemName} in ${mapping.store.storeName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditingMapping(mapping);
                            }}
                          />
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={7}
                  error={mappingsQuery.error}
                  isError={mappingsQuery.isError}
                  isLoading={mappingsQuery.isLoading}
                  label="store item mappings"
                />
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          limit={meta.limit}
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </section>
  );
}
