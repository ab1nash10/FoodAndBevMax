'use client';

import Link from 'next/link';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { invalidateKitchenQueries } from '@/lib/query-invalidation';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { DateTimeCell, RowAction, StatStrip, tableStyles } from '@/components/design-system';
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
import type { Kitchen, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Pencil, Plus } from 'lucide-react';
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

export function KitchensPageClient() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('KITCHEN_UPDATE');
  const [editingKitchen, setEditingKitchen] = useState<Kitchen | null>(null);
  const { showToast } = useToast();
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

  const kitchensQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
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
    queryKey: queryKeys.kitchens({ activeFilter, hospitalFilter, page, search, sortBy, sortOrder }),
  });

  // Under the list's own key, so whatever refreshes the list refreshes these counts too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (
          await organizationApi.listKitchens({
            hospitalId: scopedHospitalId ?? undefined,
            isActive,
            limit: 0,
          })
        ).data.meta.total;
      const [all, active, inactive] = await Promise.all([count(), count(true), count(false)]);

      return { active, all, inactive };
    },
    queryKey: queryKeys.kitchens('stats', scopedHospitalId ?? 'all'),
  });
  const stats = statsQuery.data;

  const editMutation = useMutation({
    mutationFn: ({ id, isActive, name }: { id: string; isActive: boolean; name: string }) =>
      organizationApi.updateKitchen(id, { isActive, kitchenName: name }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kitchen was not updated',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateKitchenQueries(queryClient);
      showToast({ title: 'Kitchen updated', variant: 'success' });
      setEditingKitchen(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateKitchen(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kitchen status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setStatusUpdatingId(null);
    },
    onSuccess(_, variables) {
      invalidateKitchenQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Kitchen activated' : 'Kitchen deactivated',
        variant: 'success',
      });
    },
  });

  const items = kitchensQuery.data?.items ?? [];
  const meta = kitchensQuery.data?.meta ?? {
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

  function toggleKitchenStatus(kitchen: Kitchen) {
    const nextIsActive = !kitchen.isActive;

    if (nextIsActive && !kitchen.hospital.isActive) {
      showToast({
        description: inactiveLocationMessage,
        title: 'Location is inactive',
        variant: 'info',
      });
      return;
    }

    if (!nextIsActive && !window.confirm(freezeServicesMessage)) {
      return;
    }

    setStatusUpdatingId(kitchen.id);
    statusMutation.mutate({ id: kitchen.id, isActive: nextIsActive });
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
          <IfCanOpen href="/masters/kitchens/new">
            <Button asChild>
              <Link href="/masters/kitchens/new">
                <Plus className="h-4 w-4" />
                New kitchen
              </Link>
            </Button>
          </IfCanOpen>
        }
        icon={ChefHat}
        subtitle="Manage production kitchens for location food service."
        title="Kitchens"
      />
      <StatStrip
        label="Kitchens at a glance"
        stats={[
          {
            active: !activeFilter,
            label: 'All kitchens',
            onSelect: () => showStatus(''),
            value: stats?.all ?? '–',
          },
          {
            active: activeFilter === 'active',
            label: 'Active',
            onSelect: () => showStatus('active'),
            tone: 'ok',
            value: stats?.active ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive',
            onSelect: () => showStatus('inactive'),
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />
      <Panel>
        <ListToolbar>
          <SearchInput
            label="Search kitchens"
            placeholder="Kitchen name, code or location"
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
              { label: 'Name', value: 'kitchenName' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void kitchensQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-160 table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[32%]')}>Kitchen</th>
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
                items.map((kitchen) => (
                  <tr
                    className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                    key={kitchen.id}
                    onClick={canEdit ? () => setEditingKitchen(kitchen) : undefined}
                  >
                    <td className={tableStyles.td}>
                      <p className={cn('truncate', tableStyles.title)}>{kitchen.kitchenName}</p>
                      <p className={cn('truncate', tableStyles.code)}>{kitchen.kitchenCode}</p>
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {getLocationDisplayName(kitchen.hospital)}
                    </td>
                    {/* Its own click: switching the status does not open the kitchen. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <StatusToggleCell
                        disabled={statusMutation.isPending && statusUpdatingId === kitchen.id}
                        isActive={kitchen.isActive}
                        onToggle={() => toggleKitchenStatus(kitchen)}
                        showFrozenMessage={!kitchen.hospital.isActive}
                      />
                    </td>
                    <td className={tableStyles.td}>
                      <DateTimeCell value={kitchen.updatedAt} />
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end">
                        {canEdit ? (
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${kitchen.kitchenName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingKitchen(kitchen);
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
                  error={kitchensQuery.error}
                  isError={kitchensQuery.isError}
                  isLoading={kitchensQuery.isLoading}
                  label="kitchens"
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
        location={editingKitchen ? getLocationDisplayName(editingKitchen.hospital) : ''}
        nameLabel="Kitchen name"
        onClose={() => setEditingKitchen(null)}
        onSave={(values) =>
          editingKitchen && editMutation.mutate({ id: editingKitchen.id, ...values })
        }
        record={
          editingKitchen
            ? { isActive: editingKitchen.isActive, name: editingKitchen.kitchenName }
            : null
        }
        title="Edit kitchen"
      />
    </section>
  );
}
