'use client';

import type { LegalEntity, LegalEntityInput, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { confirmStatusChange, useConfirm } from '@/components/confirm-provider';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { RowAction, StatStrip, tableStyles } from '@/components/design-system';
import {
  ActiveFilterSelect,
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/master-data/shared/components';
import { PageHeader } from '@/components/organization/shared/list-controls';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import { activeFilterToBoolean, listLimit } from '@/components/master-data/shared/utils';
import { CheckboxLine } from '@/components/organization/shared/form-controls';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateLegalEntityQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

/** GSTIN: state code, PAN, entity number, the letter Z, check character. The server checks too. */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

type EntityFormValues = Required<LegalEntityInput>;

const emptyEntity: EntityFormValues = {
  entityAddress: '',
  entityName: '',
  gstNumber: '',
  isActive: true,
  locationName: '',
};

export function LegalEntitiesPageClient() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('HOSPITAL_CREATE');
  const canEdit = hasPermission('HOSPITAL_UPDATE');
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  // null: closed; 'new': creating; an entity: editing it.
  const [dialog, setDialog] = useState<LegalEntity | 'new' | null>(null);
  const editing = dialog !== null && dialog !== 'new' ? dialog : null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const form = useForm<EntityFormValues>({ defaultValues: emptyEntity });
  const [sortBy, setSortBy] = useState('locationName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const query = {
    isActive: activeFilterToBoolean(activeFilter),
    limit: listLimit,
    page,
    search,
    sortBy,
    sortOrder,
  };
  const entitiesQuery = useQuery({
    queryFn: async () => (await organizationApi.listLegalEntities(query)).data,
    queryKey: queryKeys.legalEntities(query),
  });

  // Under the list's own key, so whatever refreshes the list refreshes these counts too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (await organizationApi.listLegalEntities({ isActive, limit: 0 })).data.meta.total;
      const [all, active, inactive] = await Promise.all([count(), count(true), count(false)]);

      return { active, all, inactive };
    },
    queryKey: queryKeys.legalEntities('stats'),
  });
  const stats = statsQuery.data;

  const saveMutation = useMutation({
    mutationFn: (body: LegalEntityInput) =>
      editing
        ? organizationApi.updateLegalEntity(editing.id, body)
        : organizationApi.createLegalEntity(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (/GST number/i.test(message)) {
        form.setError('gstNumber', { message });
      }

      showToast({
        description: message,
        title: editing ? 'Entity was not updated' : 'Entity was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateLegalEntityQueries(queryClient);
      showToast({
        recordId: response.data.id,
        title: editing ? 'Entity updated' : 'Entity created',
        variant: 'success',
      });
      closeDialog();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (entity: LegalEntity) =>
      organizationApi.updateLegalEntity(entity.id, { isActive: !entity.isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Entity status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, entity) {
      invalidateLegalEntityQueries(queryClient);
      showToast({
        recordId: entity.id,
        title: entity.isActive ? 'Entity marked inactive' : 'Entity activated',
        variant: 'success',
      });
    },
  });

  async function toggleEntity(entity: LegalEntity) {
    const confirmed = await confirmStatusChange(confirm, {
      activate: !entity.isActive,
      name: entity.entityName,
    });

    if (confirmed) toggleMutation.mutate(entity);
  }

  const hasFilters = Boolean(searchInput || activeFilter);

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setPage(1);
  }

  function showStatus(status: ActiveFilter) {
    setActiveFilter(status);
    setPage(1);
  }

  function openDialog(entity: LegalEntity | 'new') {
    setDialog(entity);
    form.reset(
      entity === 'new'
        ? emptyEntity
        : {
            entityAddress: entity.entityAddress,
            entityName: entity.entityName,
            gstNumber: entity.gstNumber,
            isActive: entity.isActive,
            locationName: entity.locationName ?? '',
          },
    );
  }

  function closeDialog() {
    setDialog(null);
    form.reset(emptyEntity);
  }

  const handleSubmit = form.handleSubmit((values) =>
    saveMutation.mutate({
      entityAddress: values.entityAddress.trim(),
      entityName: values.entityName.trim(),
      gstNumber: values.gstNumber.replace(/\s+/g, '').toUpperCase(),
      isActive: values.isActive,
      locationName: values.locationName.trim(),
    }),
  );

  const items = entitiesQuery.data?.items ?? [];
  const meta = entitiesQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const { errors } = form.formState;

  return (
    <section className="space-y-5">
      <PageHeader
        count={stats?.all}
        action={
          canCreate ? (
            <Button onClick={() => openDialog('new')} type="button">
              <Plus className="h-4 w-4" />
              New entity
            </Button>
          ) : undefined
        }
        icon={Landmark}
        subtitle="The legal entities locations and restaurants bill under: registered name, address and GST number."
        title="Entities"
      />
      <StatStrip
        label="Entities at a glance"
        stats={[
          {
            active: !activeFilter,
            label: 'All entities',
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

      <Modal
        side
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={closeDialog} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} form="legal-entity-form" type="submit">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? 'Save changes' : 'Add entity'}
            </Button>
          </div>
        }
        onClose={closeDialog}
        open={dialog !== null}
        title={editing ? 'Edit entity' : 'Add entity'}
      >
        <form
          className="grid gap-4"
          id="legal-entity-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <Field
            error={errors.locationName?.message}
            label="Location name"
            name="entity-location"
            required
          >
            <Input
              id="entity-location"
              placeholder="e.g. MSSH SKT"
              {...form.register('locationName', {
                validate: (value) => value.trim() !== '' || 'Location name is required.',
              })}
            />
          </Field>
          <Field error={errors.entityName?.message} label="Entity name" name="entity-name" required>
            <Input
              id="entity-name"
              {...form.register('entityName', {
                validate: (value) => value.trim() !== '' || 'Entity name is required.',
              })}
            />
          </Field>
          <Field
            error={errors.entityAddress?.message}
            label="Entity address"
            name="entity-address"
            required
          >
            <Input
              id="entity-address"
              {...form.register('entityAddress', {
                validate: (value) => value.trim() !== '' || 'Entity address is required.',
              })}
            />
          </Field>
          <Field error={errors.gstNumber?.message} label="GST number" name="entity-gst" required>
            <Input
              className="uppercase"
              id="entity-gst"
              placeholder="07AADCM0815B1ZQ"
              {...form.register('gstNumber', {
                validate: (value) =>
                  GSTIN_PATTERN.test(value.replace(/\s+/g, '').toUpperCase()) ||
                  'Enter a valid 15-character GST number.',
              })}
            />
          </Field>
          <CheckboxLine
            input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
          >
            Active
          </CheckboxLine>
        </form>
      </Modal>

      <Panel>
        <ListToolbar>
          <SearchInput
            label="Search entities"
            placeholder="Entity name, GST no. or location"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu activeCount={activeFilter ? 1 : 0}>
            <FilterField label="Status">
              <ActiveFilterSelect
                onChange={(value) => {
                  setActiveFilter(value);
                  setPage(1);
                }}
                value={activeFilter}
              />
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
              { label: 'Location', value: 'locationName' },
              { label: 'Entity name', value: 'entityName' },
              { label: 'GST no.', value: 'gstNumber' },
              { label: 'Created date', value: 'createdAt' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void entitiesQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'phone-cards min-w-190 table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[14%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[24%]')}>Entity name</th>
                <th className={cn(tableStyles.th, 'w-[29%]')}>Entity address</th>
                <th className={cn(tableStyles.th, 'w-[16%]')}>GST no.</th>
                <th className={cn(tableStyles.th, 'w-[12%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-14')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((entity) => (
                  <tr
                    className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                    data-record-id={entity.id}
                    key={entity.id}
                    onClick={canEdit ? () => openDialog(entity) : undefined}
                  >
                    <td className={cn(tableStyles.td, tableStyles.title)}>
                      {entity.locationName ?? '—'}
                    </td>
                    <td className={cn(tableStyles.td, 'font-medium text-ds-text')}>
                      {entity.entityName}
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>{entity.entityAddress}</td>
                    <td
                      className={cn(tableStyles.td, tableStyles.num, 'text-[12.5px] text-ds-text')}
                    >
                      {entity.gstNumber}
                    </td>
                    {/* Its own click: switching the status does not open the entity. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <span className="flex items-center gap-2">
                        <Toggle
                          ariaLabel={`${entity.entityName} active`}
                          checked={entity.isActive}
                          disabled={!canEdit || toggleMutation.isPending}
                          onChange={() => void toggleEntity(entity)}
                        />
                        <span
                          className={cn(
                            'text-xs font-bold',
                            entity.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                          )}
                        >
                          {entity.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end">
                        {canEdit ? (
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${entity.locationName ?? entity.entityName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openDialog(entity);
                            }}
                          />
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  atLocation={false}
                  colSpan={6}
                  error={entitiesQuery.error}
                  hint="Add the legal entities your locations and restaurants bill under."
                  isError={entitiesQuery.isError}
                  isLoading={entitiesQuery.isLoading}
                  label="entities"
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
