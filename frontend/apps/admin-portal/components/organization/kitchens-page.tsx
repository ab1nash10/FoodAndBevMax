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
import {
  activeFilterToBoolean,
  formatDate,
  listLimit,
} from '@/components/organization/shared/utils';
import {
  formatLocationOption,
  freezeServicesMessage,
  getLocationDisplayName,
  inactiveLocationMessage,
} from '@/components/organization/shared/locations';
import { useHospitalOptions } from '@/components/organization/shared/hooks';
import type { ActiveFilter } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';

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

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <IfCanOpen href="/masters/kitchens/new">
            <Button asChild>
              <Link href="/masters/kitchens/new">
                <Plus className="h-4 w-4" />
                Create
              </Link>
            </Button>
          </IfCanOpen>
        }
        eyebrow="Organization"
        icon={ChefHat}
        subtitle="Manage production kitchens for location food service."
        title="Kitchens"
      />
      <Panel>
        <ListToolbar>
          <SearchInput
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
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[30%] px-4 py-2.5">Kitchen</th>
                <th className="w-[26%] px-4 py-2.5">Location</th>
                <th className="w-[22%] px-4 py-2.5">Status</th>
                <th className="w-[16%] px-4 py-2.5">Updated</th>
                <th className="w-16 px-2 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((kitchen) => (
                  <tr className="hover:bg-ds-subtle" key={kitchen.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-ds-text">{kitchen.kitchenName}</p>
                        <p className="text-xs text-ds-muted">{kitchen.kitchenCode}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {getLocationDisplayName(kitchen.hospital)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusToggleCell
                        disabled={statusMutation.isPending && statusUpdatingId === kitchen.id}
                        isActive={kitchen.isActive}
                        onToggle={() => toggleKitchenStatus(kitchen)}
                        showFrozenMessage={!kitchen.hospital.isActive}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-muted">
                      {formatDate(kitchen.updatedAt)}
                    </td>
                    <td className="px-2 py-3">
                      {canEdit ? (
                        <Button
                          aria-label={`Edit ${kitchen.kitchenName}`}
                          onClick={() => setEditingKitchen(kitchen)}
                          size="icon"
                          title="Edit"
                          type="button"
                          variant="outline"
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      ) : null}
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
