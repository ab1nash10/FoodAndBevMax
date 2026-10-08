'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, Pencil, RefreshCw, Store as StoreIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type {
  SortOrder,
  Store,
  StoreItem,
  StoreItemInput,
  StoreItemListQuery,
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

export function StoreItemsPageClient() {
  const { scopedHospitalId } = useLocationContext();
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
  const [viewingMapping, setViewingMapping] = useState<StoreItem | null>(null);
  const form = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  const hospitalsQuery = useHospitalOptions();
  const storesQuery = useStoreOptions(hospitalFilter);
  const itemsQuery = useItemOptions('MRP');
  const invalidateStoreItems = useInvalidateMappingQueries('store-items', 'store-options');
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setPage(1);

    if (!editingMapping) {
      form.setValue('parentId', '', { shouldValidate: true });
    }
  }, [editingMapping, form, scopedHospitalId]);

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
    mutationFn: (body: StoreItemInput) =>
      editingMapping
        ? organizationApi.updateStoreItem(editingMapping.id, body)
        : organizationApi.createStoreItem(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingMapping ? 'Store item was not updated' : 'Store item was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateStoreItems();
      showToast({
        title: editingMapping ? 'Store item updated' : 'Store item created',
        variant: 'success',
      });
      setEditingMapping(null);
      form.reset(emptyMappingFormValues());
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
        title: variables.isActive ? 'Store item mapping activated' : 'Store item mapping inactive',
        variant: 'success',
      });
    },
  });

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

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = mappingSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveMappingMutation.mutate({
      isActive: parsed.data.isActive,
      itemId: parsed.data.itemId,
      storeId: parsed.data.parentId,
    });
  });

  function startEditingMapping(mapping: StoreItem) {
    setEditingMapping(mapping);
    form.reset({
      isActive: mapping.isActive,
      itemId: mapping.itemId,
      parentId: mapping.storeId,
    });
  }

  function cancelEditingMapping() {
    setEditingMapping(null);
    form.reset(emptyMappingFormValues());
  }

  function toggleMappingStatus(mapping: StoreItem) {
    const nextIsActive = !mapping.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this mapping inactive will prevent this item from being used in new GRNs for this store. Existing stock and history will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleMappingStatusMutation.mutate({ isActive: nextIsActive, mapping });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        icon={StoreIcon}
        subtitle="Map MRP items to stores for future sales and stock flows."
        title="Store Items"
      />
      <Panel className="p-4">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-ds-text">
            {editingMapping ? 'Edit Store Item' : 'Create Store Item'}
          </h2>
          <p className="text-sm text-ds-muted">Only MRP items are available for store mapping.</p>
        </div>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <MappingFormFields
            form={form}
            itemLabel="MRP Item"
            items={itemsQuery.data}
            parentLabel="Store"
            parents={stores}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingMapping ? (
              <Button onClick={cancelEditingMapping} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
            <SubmitButton
              isPending={saveMappingMutation.isPending}
              label={editingMapping ? 'Update Store Item' : 'Create Store Item'}
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
              setStoreFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
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
          <Select
            onChange={(event) => {
              setItemFilter(event.target.value);
              setPage(1);
            }}
            value={itemFilter}
          >
            <option value="">All MRP items</option>
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
                <th className="w-[15%] px-4 py-2.5">Store</th>
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
                        {mapping.store.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-ds-muted">{mapping.store.hospital.hospitalCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={locationHref(
                          'STORE',
                          mapping.store.storeCode || mapping.store.storeName,
                        )}
                      >
                        {mapping.store.storeName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{mapping.store.storeCode}</p>
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
                        ariaLabel={`${mapping.item.itemName} in ${mapping.store.storeName} active`}
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
      <DetailsModal
        onClose={() => setViewingMapping(null)}
        rows={
          viewingMapping && [
            [
              'Location',
              `${viewingMapping.store.hospital.hospitalName} (${viewingMapping.store.hospital.hospitalCode})`,
            ],
            ['Store', `${viewingMapping.store.storeName} (${viewingMapping.store.storeCode})`],
            ['Item', `${viewingMapping.item.itemName} (${viewingMapping.item.itemCode})`],
            ['Category', viewingMapping.item.category?.categoryName ?? '-'],
            ['Status', <StatusBadge isActive={viewingMapping.isActive} key="status" />],
            ['Created', formatDate(viewingMapping.createdAt)],
            ['Updated', formatDate(viewingMapping.updatedAt)],
          ]
        }
        title="Store Item"
      />
    </section>
  );
}
