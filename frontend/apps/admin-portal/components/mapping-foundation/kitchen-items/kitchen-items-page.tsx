'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChefHat, Eye, Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type {
  Kitchen,
  KitchenItem,
  KitchenItemInput,
  KitchenItemListQuery,
  SortOrder,
} from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { DetailsModal, Toggle } from '@/components/ui-controls';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { RecordLink } from '@/components/record-link';
import { locationHref, recordHref } from '@/lib/navigation';
import {
  ActiveFilterSelect,
  HospitalFilterSelect,
  MappingFormFields,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusBadge,
  SubmitButton,
} from '@/components/mapping-foundation/shared/components';
import type { ActiveFilter, MappingFormValues } from '@/components/mapping-foundation/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  emptyMappingFormValues,
  formatDate,
  listLimit,
  mappingSchema,
  useEntityList,
  useHospitalOptions,
  useInvalidateMappingQueries,
  useItemOptions,
} from '@/components/mapping-foundation/shared/utils';
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

export function KitchenItemsPageClient() {
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
  const [viewingMapping, setViewingMapping] = useState<KitchenItem | null>(null);
  const form = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  const hospitalsQuery = useHospitalOptions();
  const kitchensQuery = useKitchenOptions(hospitalFilter);
  const itemsQuery = useItemOptions('READYMADE');
  const invalidateKitchenItems = useInvalidateMappingQueries('kitchen-items', 'kitchen-options');
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setKitchenFilter('');
    setPage(1);

    if (!editingMapping) {
      form.setValue('parentId', '', { shouldValidate: true });
    }
  }, [editingMapping, form, scopedHospitalId]);

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
    mutationFn: (body: KitchenItemInput) =>
      editingMapping
        ? organizationApi.updateKitchenItem(editingMapping.id, body)
        : organizationApi.createKitchenItem(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingMapping ? 'Kitchen item was not updated' : 'Kitchen item was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateKitchenItems();
      showToast({
        title: editingMapping ? 'Kitchen item updated' : 'Kitchen item created',
        variant: 'success',
      });
      setEditingMapping(null);
      form.reset(emptyMappingFormValues());
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
        title: variables.isActive
          ? 'Kitchen item mapping activated'
          : 'Kitchen item mapping inactive',
        variant: 'success',
      });
    },
  });

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

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = mappingSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveMappingMutation.mutate({
      isActive: parsed.data.isActive,
      itemId: parsed.data.itemId,
      kitchenId: parsed.data.parentId,
    });
  });

  function startEditingMapping(mapping: KitchenItem) {
    setEditingMapping(mapping);
    form.reset({
      isActive: mapping.isActive,
      itemId: mapping.itemId,
      parentId: mapping.kitchenId,
    });
  }

  function cancelEditingMapping() {
    setEditingMapping(null);
    form.reset(emptyMappingFormValues());
  }

  function toggleMappingStatus(mapping: KitchenItem) {
    const nextIsActive = !mapping.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this mapping inactive will prevent this item from being used in new kitchen production. Existing stock and history will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleMappingStatusMutation.mutate({ isActive: nextIsActive, mapping });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        icon={ChefHat}
        subtitle="Map readymade items to kitchens for future production handoff."
        title="Kitchen Items"
      />
      <Panel className="p-4">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-ds-text">
            {editingMapping ? 'Edit Kitchen Item' : 'Create Kitchen Item'}
          </h2>
          <p className="text-sm text-ds-muted">
            Only readymade items are available for kitchen mapping.
          </p>
        </div>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
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
            form={form}
            itemLabel="Readymade Item"
            items={itemsQuery.data}
            parentLabel="Kitchen"
            parents={kitchens}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingMapping ? (
              <Button onClick={cancelEditingMapping} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
            <SubmitButton
              isPending={saveMappingMutation.isPending}
              label={editingMapping ? 'Update Kitchen Item' : 'Create Kitchen Item'}
            />
          </div>
        </form>
      </Panel>
      <Panel>
        <div className="grid gap-3 border-b border-ds-divider p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:[&>*:first-child]:col-span-2 [&>button]:justify-self-start">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <ActiveFilterSelect
            onChange={(value) => {
              setActiveFilter(value);
              setPage(1);
            }}
            value={activeFilter}
          />
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
          <Select
            onChange={(event) => {
              setItemFilter(event.target.value);
              setPage(1);
            }}
            value={itemFilter}
          >
            <option value="">All readymade items</option>
            {itemsQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemName}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="createdAt">Created date</option>
            <option value="updatedAt">Updated date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void mappingsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[15%] px-4 py-2.5">Location</th>
                <th className="w-[15%] px-4 py-2.5">Kitchen</th>
                <th className="w-[16%] px-4 py-2.5">Item</th>
                <th className="w-[12%] px-4 py-2.5">Category</th>
                <th className="w-[10%] px-4 py-2.5">Status</th>
                <th className="w-[14%] px-4 py-2.5">Active / Inactive</th>
                <th className="w-[15%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[15%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[18%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {mappings.length > 0 ? (
                mappings.map((mapping) => (
                  <tr className="hover:bg-ds-subtle" key={mapping.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ds-text">
                        {mapping.kitchen.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-ds-muted">
                        {mapping.kitchen.hospital.hospitalCode}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={locationHref(
                          'KITCHEN',
                          mapping.kitchen.kitchenCode || mapping.kitchen.kitchenName,
                        )}
                      >
                        {mapping.kitchen.kitchenName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{mapping.kitchen.kitchenCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: mapping.item.id })}
                      >
                        {mapping.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{mapping.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {mapping.item.category?.categoryName ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={mapping.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        ariaLabel={`${mapping.item.itemName} in ${mapping.kitchen.kitchenName} active`}
                        checked={mapping.isActive}
                        disabled={toggleMappingStatusMutation.isPending}
                        onChange={() => toggleMappingStatus(mapping)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(mapping.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(mapping.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingMapping(mapping)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => setViewingMapping(mapping)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={9}
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
      <DetailsModal
        onClose={() => setViewingMapping(null)}
        rows={
          viewingMapping && [
            [
              'Location',
              `${viewingMapping.kitchen.hospital.hospitalName} (${viewingMapping.kitchen.hospital.hospitalCode})`,
            ],
            [
              'Kitchen',
              `${viewingMapping.kitchen.kitchenName} (${viewingMapping.kitchen.kitchenCode})`,
            ],
            ['Item', `${viewingMapping.item.itemName} (${viewingMapping.item.itemCode})`],
            ['Category', viewingMapping.item.category?.categoryName ?? '-'],
            ['Status', <StatusBadge isActive={viewingMapping.isActive} key="status" />],
            ['Created', formatDate(viewingMapping.createdAt)],
            ['Updated', formatDate(viewingMapping.updatedAt)],
          ]
        }
        title="Kitchen Item"
      />
    </section>
  );
}
