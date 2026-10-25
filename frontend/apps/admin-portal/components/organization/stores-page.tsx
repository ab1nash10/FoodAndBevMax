'use client';

import Link from 'next/link';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { confirmStatusChange, useConfirm } from '@/components/confirm-provider';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import {
  DateTimeCell,
  RecordAvatar,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { EditMasterDialog } from '@/components/organization/shared/edit-master-dialog';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { IfCanOpen } from '@/components/record-link';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { SortOrder, Store as StoreRecord } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  StatusToggleCell,
} from '@/components/organization/shared/list-controls';
import { activeFilterToBoolean, listLimit } from '@/components/organization/shared/utils';
import {
  formatLocationOption,
  freezeServicesMessage,
  getLocationDisplayName,
  inactiveLocationMessage,
} from '@/components/organization/shared/locations';
import { useHospitalOptions } from '@/components/organization/shared/hooks';
import type { ActiveFilter } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

export function StoresPageClient() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('STORE_UPDATE');
  const [editingStore, setEditingStore] = useState<StoreRecord | null>(null);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const hospitalOptionsQuery = useHospitalOptions();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setPage(1);
  });

  const storesQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listStores({
        hospitalId: hospitalFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: queryKeys.stores({ activeFilter, hospitalFilter, page, search, sortBy, sortOrder }),
  });

  // Under the list's own key, so whatever refreshes the list refreshes these counts too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (
          await organizationApi.listStores({
            hospitalId: scopedHospitalId ?? undefined,
            isActive,
            limit: 0,
          })
        ).data.meta.total;
      const [all, active, inactive] = await Promise.all([count(), count(true), count(false)]);

      return { active, all, inactive };
    },
    queryKey: queryKeys.stores('stats', scopedHospitalId ?? 'all'),
  });
  const stats = statsQuery.data;

  const editMutation = useMutation({
    mutationFn: ({ id, isActive, name }: { id: string; isActive: boolean; name: string }) =>
      organizationApi.updateStore(id, { isActive, storeName: name }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Store was not updated',
        variant: 'error',
      });
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stores() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.storeOptions() });
      showToast({ recordId: variables.id, title: 'Store updated', variant: 'success' });
      setEditingStore(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateStore(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Store status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setStatusUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stores() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.storeOptions() });
      showToast({
        recordId: variables.id,
        title: variables.isActive ? 'Store activated' : 'Store deactivated',
        variant: 'success',
      });
    },
  });

  const items = storesQuery.data?.items ?? [];
  const meta = storesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  const hasFilters = Boolean(
    searchInput || activeFilter || hospitalFilter !== (scopedHospitalId ?? ''),
  );

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setHospitalFilter(scopedHospitalId ?? '');
    setPage(1);
  }

  async function toggleStoreStatus(store: StoreRecord) {
    const nextIsActive = !store.isActive;

    if (nextIsActive && !store.hospital.isActive) {
      showToast({
        description: inactiveLocationMessage,
        title: 'Location is inactive',
        variant: 'info',
      });
      return;
    }

    const confirmed = await confirmStatusChange(confirm, {
      activate: nextIsActive,
      effect: freezeServicesMessage,
      name: store.storeName,
    });

    if (!confirmed) {
      return;
    }

    setStatusUpdatingId(store.id);
    statusMutation.mutate({ id: store.id, isActive: nextIsActive });
  }

  function showStatus(status: ActiveFilter) {
    setActiveFilter(status);
    setPage(1);
  }

  return (
    <section className="space-y-5">
      <PageHeader
        count={stats?.all}
        action={
          <IfCanOpen href="/masters/stores/new">
            <Button asChild>
              <Link href="/masters/stores/new">
                <Plus className="h-4 w-4" />
                New store
              </Link>
            </Button>
          </IfCanOpen>
        }
        icon={Store}
        subtitle="Manage F&B stores linked to locations."
        title="Stores"
      />
      <StatStrip
        label="Stores at a glance"
        stats={[
          {
            active: !activeFilter,
            label: 'All stores',
            onSelect: () => showStatus(''),
            share: stats?.all ? 1 : undefined,
            value: stats?.all ?? '–',
          },
          {
            active: activeFilter === 'active',
            label: 'Active',
            onSelect: () => showStatus('active'),
            tone: 'ok',
            share: stats?.all ? stats.active / stats.all : undefined,
            value: stats?.active ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive',
            onSelect: () => showStatus('inactive'),
            tone: 'pending',
            share: stats?.all ? stats.inactive / stats.all : undefined,
            value: stats?.inactive ?? '–',
          },
        ]}
      />
      <Panel>
        <ListToolbar>
          <SearchInput
            label="Search stores"
            placeholder="Store name, code, type or location"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu
            activeCount={
              [activeFilter, hospitalFilter !== (scopedHospitalId ?? '')].filter(Boolean).length
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
              <Select
                disabled={hospitalOptionsQuery.isLoading || Boolean(scopedHospitalId)}
                onChange={(event) => {
                  setHospitalFilter(event.target.value);
                  setPage(1);
                }}
                value={hospitalFilter}
              >
                <option value="">All locations</option>
                {hospitalOptionsQuery.data?.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {formatLocationOption(hospital)}
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
              { label: 'Name', value: 'storeName' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void storesQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'phone-cards min-w-160 table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[32%]')}>Store/F&B</th>
                <th className={cn(tableStyles.th, 'w-[28%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[22%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-[14%]')}>Updated</th>
                <th className={cn(tableStyles.th, 'w-14')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((store) => (
                  <tr
                    className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                    data-record-id={store.id}
                    key={store.id}
                    onClick={canEdit ? () => setEditingStore(store) : undefined}
                  >
                    <td className={tableStyles.td}>
                      <span className="flex min-w-0 items-center gap-3">
                        <RecordAvatar name={store.storeName} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className={cn('truncate', tableStyles.title)}>
                            {store.storeName}
                          </span>
                          <span className={cn('truncate', tableStyles.code)}>
                            {store.storeCode}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {getLocationDisplayName(store.hospital)}
                    </td>
                    {/* Its own click: switching the status does not open the store. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <StatusToggleCell
                        disabled={statusMutation.isPending && statusUpdatingId === store.id}
                        isActive={store.isActive}
                        onToggle={() => void toggleStoreStatus(store)}
                        showFrozenMessage={!store.hospital.isActive}
                      />
                    </td>
                    <td className={tableStyles.td}>
                      <DateTimeCell value={store.updatedAt} />
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end">
                        {canEdit ? (
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${store.storeName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingStore(store);
                            }}
                          />
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={5}
                  error={storesQuery.error}
                  isError={storesQuery.isError}
                  isLoading={storesQuery.isLoading}
                  label="stores"
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
      <EditMasterDialog
        isPending={editMutation.isPending}
        location={editingStore ? getLocationDisplayName(editingStore.hospital) : ''}
        nameLabel="Store name"
        onClose={() => setEditingStore(null)}
        onSave={(values) => editingStore && editMutation.mutate({ id: editingStore.id, ...values })}
        record={
          editingStore ? { isActive: editingStore.isActive, name: editingStore.storeName } : null
        }
        title="Edit store"
      />
    </section>
  );
}
