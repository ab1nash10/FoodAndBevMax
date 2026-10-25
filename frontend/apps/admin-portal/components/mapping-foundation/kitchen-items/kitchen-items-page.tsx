'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChefHat, Loader2, Pencil, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type {
  Kitchen,
  KitchenItem,
  KitchenItemInput,
  KitchenItemListQuery,
  SortOrder,
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

function useKitchenOptions(hospitalId?: string) {
  return useQuery<Kitchen[]>({
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
        hospitalId: hospitalId || undefined,
        isActive: true,
        limit: 100,
        sortBy: 'kitchenName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.kitchenOptions(hospitalId ?? 'all'),
  });
}

/**
 * Inside the Item Mapping page (`embedded`) it drops its own title and shows the page's
 * Store / Kitchen tabs above the list; Create and Edit open in pop-ups.
 */
/** This kitchen's mappings of an item, for greying out the categories it already has. */
const existingKitchenMappings = {
  key: 'kitchen-items',
  load: async (parentId: string, itemId: string) =>
    (await organizationApi.listKitchenItems({ kitchenId: parentId, itemId, limit: 100 })).data
      .items,
};

export function KitchenItemsPageClient({
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
  const [kitchenFilter, setKitchenFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingMapping, setEditingMapping] = useState<KitchenItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const form = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  // Edit has its own form in a pop-up, so the Create form above keeps what was typed in it.
  const editForm = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  const hospitalsQuery = useHospitalOptions();
  const kitchensQuery = useKitchenOptions(hospitalFilter);
  // The whole catalogue; the form greys out items already mapped the other way.
  const itemsQuery = useItemOptions();
  const categoriesQuery = useItemCategoryOptions();
  const invalidateKitchenItems = useInvalidateMappingQueries('kitchen-items', 'kitchen-options');
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('KITCHEN_ITEM_UPDATE');

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setKitchenFilter('');
    setPage(1);
    form.setValue('parentId', '', { shouldValidate: true });
  }, [form, scopedHospitalId]);

  const mappingsQuery = useEntityList<KitchenItem, KitchenItemListQuery>(
    'kitchen-items',
    {
      isActive: activeFilterToBoolean(activeFilter),
      hospitalId: hospitalFilter,
      itemId: itemFilter,
      kitchenId: kitchenFilter,
      limit: listLimit,
      page,
      search,
      sortBy,
      sortOrder,
    },
    (query) => organizationApi.listKitchenItems(query),
  );

  const saveMappingMutation = useMutation({
    mutationFn: ({ body, id }: { body: KitchenItemInput; id?: string }) =>
      id ? organizationApi.updateKitchenItem(id, body) : organizationApi.createKitchenItem(body),
    onError(error, variables) {
      showToast({
        description: getApiErrorMessage(error),
        title: variables.id ? 'Kitchen item was not updated' : 'Kitchen item was not created',
        variant: 'error',
      });
    },
    onSuccess(response, variables) {
      invalidateKitchenItems();
      showToast({
        recordId: response.data.id,
        title: variables.id ? 'Kitchen item updated' : 'Kitchen item created',
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
    mutationFn: ({ isActive, mapping }: { isActive: boolean; mapping: KitchenItem }) =>
      organizationApi.updateKitchenItem(mapping.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kitchen item status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateKitchenItems();
      showToast({
        recordId: variables.mapping.id,
        title: variables.isActive
          ? 'Kitchen item mapping activated'
          : 'Kitchen item mapping deactivated',
        variant: 'success',
      });
    },
  });
  const confirm = useConfirm();

  const kitchens =
    kitchensQuery.data?.map((kitchen) => ({
      code: kitchen.kitchenCode,
      id: kitchen.id,
      name: kitchen.kitchenName,
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
          kitchenId: parsed.data.parentId,
        },
        id,
      });
    });

  const hasFilters = Boolean(
    searchInput ||
    activeFilter ||
    hospitalFilter !== (scopedHospitalId ?? '') ||
    kitchenFilter ||
    itemFilter,
  );

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setHospitalFilter(scopedHospitalId ?? '');
    setKitchenFilter('');
    setItemFilter('');
    setPage(1);
  }

  function startEditingMapping(mapping: KitchenItem) {
    setEditingMapping(mapping);
    editForm.reset({
      categoryId: mapping.categoryId ?? '',
      isActive: mapping.isActive,
      itemId: mapping.itemId,
      parentId: mapping.kitchenId,
    });
  }

  function cancelEditingMapping() {
    setEditingMapping(null);
  }

  async function toggleMappingStatus(mapping: KitchenItem) {
    const isActive = !mapping.isActive;
    const confirmed = await confirmStatusChange(confirm, {
      activate: isActive,
      effect:
        'It can’t be used in new kitchen production. Existing stock and history stay visible.',
      name: `${mapping.item.itemName} in ${mapping.kitchen.kitchenName}`,
    });

    if (confirmed) toggleMappingStatusMutation.mutate({ isActive, mapping });
  }

  return (
    <section className="space-y-5">
      {embedded ? null : (
        <PageHeader
          icon={ChefHat}
          subtitle="Map readymade items to kitchens for future production handoff."
          title="Kitchen Items"
        />
      )}
      <Modal
        side
        footer={
          <div className="flex justify-end gap-3">
            <Button onClick={() => setIsCreating(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saveMappingMutation.isPending}
              form="create-kitchen-item"
              type="submit"
            >
              {saveMappingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Kitchen Item
            </Button>
          </div>
        }
        onClose={() => setIsCreating(false)}
        open={isCreating}
        title="Map Item to Kitchen"
      >
        <form
          className="grid gap-4"
          id="create-kitchen-item"
          onSubmit={(event) => {
            void submitMapping(form)(event);
          }}
        >
          <p className="text-sm text-ds-muted">
            Pick an item not mapped yet, or a Readymade item: mapping it here makes it Readymade and
            sets its category. An MRP item cannot be mapped to a kitchen.
          </p>
          {kitchensQuery.data?.length === 0 ? (
            <SetupNotice href="/masters/kitchens/new" linkLabel="Create a kitchen">
              {locationName ? `${locationName} has no kitchen yet` : 'There is no kitchen yet'}, so
              there is nothing to map items to.
            </SetupNotice>
          ) : null}
          {itemsQuery.data?.length === 0 ? (
            <SetupNotice href="/masters/items/new" linkLabel="Create an item">
              There are no active READYMADE items to map yet.
            </SetupNotice>
          ) : null}
          <MappingFormFields
            categories={categoriesQuery.data}
            existingMappings={existingKitchenMappings}
            form={form}
            itemLabel="Item"
            mapsAs="READYMADE"
            typeLabel="Readymade"
            items={itemsQuery.data}
            parentLabel="Kitchen"
            parents={kitchens}
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
            <Button disabled={saveMappingMutation.isPending} form="edit-kitchen-item" type="submit">
              {saveMappingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        }
        onClose={cancelEditingMapping}
        open={editingMapping !== null}
        title="Edit Kitchen Item"
      >
        <form
          className="grid gap-4"
          id="edit-kitchen-item"
          onSubmit={(event) => {
            if (editingMapping) {
              void submitMapping(editForm, editingMapping.id)(event);
            }
          }}
        >
          <MappingFormFields
            categories={categoriesQuery.data}
            editingId={editingMapping?.id}
            existingMappings={existingKitchenMappings}
            form={editForm}
            itemLabel="Item"
            mapsAs="READYMADE"
            typeLabel="Readymade"
            items={itemsQuery.data}
            parentLabel="Kitchen"
            parents={kitchens}
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
            label="Search kitchen items"
            placeholder="Item name or code, category or kitchen"
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
                kitchenFilter,
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
                  setKitchenFilter('');
                  setPage(1);
                }}
                value={hospitalFilter}
              />
            </FilterField>
            <FilterField label="Kitchen">
              <Select
                onChange={(event) => {
                  setKitchenFilter(event.target.value);
                  setPage(1);
                }}
                value={kitchenFilter}
              >
                <option value="">All kitchens</option>
                {kitchens.map((kitchen) => (
                  <option key={kitchen.id} value={kitchen.id}>
                    {kitchen.name}
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
                <option value="">All readymade items</option>
                {itemsQuery.data
                  ?.filter((item) => item.itemType === 'READYMADE')
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
                <th className={cn(tableStyles.th, 'w-[19%]')}>Kitchen</th>
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
                            'KITCHEN',
                            mapping.kitchen.kitchenCode || mapping.kitchen.kitchenName,
                          )}
                        >
                          {mapping.kitchen.kitchenName}
                        </RecordLink>
                        <span className={cn('truncate', tableStyles.code)}>
                          {mapping.kitchen.kitchenCode}
                        </span>
                      </span>
                    </td>
                    <td className={tableStyles.td}>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-ds-text-2">
                          {mapping.kitchen.hospital.hospitalName}
                        </span>
                        <span className={cn('truncate', tableStyles.code)}>
                          {mapping.kitchen.hospital.hospitalCode}
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
                        ariaLabel={`${mapping.item.itemName} in ${mapping.kitchen.kitchenName} active`}
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
                            label={`Edit ${mapping.item.itemName} in ${mapping.kitchen.kitchenName}`}
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
                  label="kitchen item mappings"
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
