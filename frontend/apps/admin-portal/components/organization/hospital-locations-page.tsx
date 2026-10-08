'use client';

import Link from 'next/link';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { DetailsModal } from '@/components/ui-controls';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { HospitalInput, Location, LocationInput, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, MapPin, Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusBadge,
  StatusToggleCell,
  ToolbarGrid,
} from '@/components/organization/shared/list-controls';
import { CheckboxLine, SubmitButton } from '@/components/organization/shared/form-controls';
import { LocationMasterFormFields } from '@/components/organization/shared/location-form-fields';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  listLimit,
  nullableText,
  optionalValue,
  organizationSchemas,
} from '@/components/organization/shared/utils';
import {
  freezeServicesMessage,
  getLocationTitle,
  toHospitalFormDefaults,
  toHospitalInput,
} from '@/components/organization/shared/locations';
import type {
  ActiveFilter,
  HospitalFormValues,
  LocationFormValues,
} from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';

export function HospitalLocationsPageClient({ hospitalId }: Readonly<{ hospitalId: string }>) {
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [sortBy, setSortBy] = useState('locationName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [viewingLocation, setViewingLocation] = useState<Location | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const locationMasterForm = useForm<HospitalFormValues>({
    defaultValues: toHospitalFormDefaults(),
  });
  const form = useForm<LocationFormValues>({
    defaultValues: {
      address: '',
      area: '',
      building: '',
      floor: '',
      hospitalId,
      isActive: true,
      locationName: '',
    },
  });

  const hospitalQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.getHospital(hospitalId);

      return response.data;
    },
    queryKey: queryKeys.hospital(hospitalId),
  });
  useBreadcrumbLabel(
    hospitalId,
    hospitalQuery.data?.hospitalName ?? (hospitalQuery.isError ? 'Not found' : undefined),
  );

  useEffect(() => {
    if (hospitalQuery.data) {
      locationMasterForm.reset(toHospitalFormDefaults(hospitalQuery.data));
    }
  }, [hospitalQuery.data, locationMasterForm]);

  const locationsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listLocations({
        hospitalId,
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: queryKeys.hospitalLocations(hospitalId, {
      activeFilter,
      page,
      search,
      sortBy,
      sortOrder,
    }),
  });

  const saveLocationMutation = useMutation({
    mutationFn: (body: LocationInput) =>
      editingLocation
        ? organizationApi.updateLocation(editingLocation.id, body)
        : organizationApi.createLocation(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingLocation ? 'Location was not updated' : 'Location was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitalLocations(hospitalId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.locationOptions(hospitalId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations() });
      showToast({
        title: editingLocation ? 'Location updated' : 'Location created',
        variant: 'success',
      });
      setEditingLocation(null);
      form.reset({
        address: '',
        area: '',
        building: '',
        floor: '',
        hospitalId,
        isActive: true,
        locationName: '',
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateLocation(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitalLocations(hospitalId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.locationOptions(hospitalId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations() });
      showToast({
        title: variables.isActive ? 'Location activated' : 'Location deactivated',
        variant: 'success',
      });
    },
  });

  function toggleLocationStatus(location: Location) {
    const nextIsActive = !location.isActive;

    if (!nextIsActive && !window.confirm(freezeServicesMessage)) {
      return;
    }

    statusMutation.mutate({ id: location.id, isActive: nextIsActive });
  }

  const updateLocationMasterMutation = useMutation({
    mutationFn: (body: HospitalInput) => organizationApi.updateHospital(hospitalId, body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location was not updated',
        variant: 'error',
      });
    },
    onSuccess(response) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospital(hospitalId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitals() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitalOptions() });
      locationMasterForm.reset(toHospitalFormDefaults(response.data));
      showToast({
        title: 'Location updated',
        variant: 'success',
      });
    },
  });

  const items = locationsQuery.data?.items ?? [];
  const meta = locationsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };
  const hospital = hospitalQuery.data;

  useEffect(() => organizationSchemas.warm(), []);

  const handleLocationMasterSubmit = locationMasterForm.handleSubmit(async (values) => {
    const { hospitalSchema } = await organizationSchemas.get();
    const parsed = hospitalSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(locationMasterForm, parsed.error);
      return;
    }

    updateLocationMasterMutation.mutate(toHospitalInput(parsed.data));
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    const { locationSchema } = await organizationSchemas.get();
    const parsed = locationSchema.safeParse({
      ...values,
      hospitalId,
    });

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveLocationMutation.mutate({
      address: optionalValue(parsed.data.address),
      area: optionalValue(parsed.data.area),
      building: optionalValue(parsed.data.building),
      floor: optionalValue(parsed.data.floor),
      hospitalId,
      isActive: parsed.data.isActive,
      locationName: parsed.data.locationName,
    });
  });

  function startEditingLocation(location: Location) {
    setEditingLocation(location);
    form.reset({
      address: location.address ?? '',
      area: location.area ?? '',
      building: location.building ?? '',
      floor: location.floor ?? '',
      hospitalId,
      isActive: location.isActive,
      locationName: location.locationName,
    });
  }

  function cancelEditingLocation() {
    setEditingLocation(null);
    form.reset({
      address: '',
      area: '',
      building: '',
      floor: '',
      hospitalId,
      isActive: true,
      locationName: '',
    });
  }

  return (
    <section className="space-y-5">
      <Button asChild variant="ghost">
        <Link href="/masters/locations">
          <ArrowLeft className="h-4 w-4" />
          Back to Locations
        </Link>
      </Button>
      <PageHeader
        eyebrow="Location Master"
        icon={MapPin}
        subtitle="View and update operating location details."
        title={hospital ? getLocationTitle(hospital) : 'Location'}
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href="#details">
            <Eye className="h-4 w-4" />
            Location Details
          </a>
        </Button>
        <Button asChild size="sm">
          <a href="#locations">
            <MapPin className="h-4 w-4" />
            Service Areas
          </a>
        </Button>
      </div>

      <Panel className="p-4" id="details">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-ds-text">
              Add/Update Location
            </h2>
            <p className="text-sm text-ds-muted">
              Creating a Location will auto-create Main Store and Main Kitchen.
            </p>
          </div>
          {hospital ? <StatusBadge isActive={hospital.isActive} /> : null}
        </div>
        {hospitalQuery.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-64" />
          </div>
        ) : hospitalQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            {getApiErrorMessage(hospitalQuery.error)}
          </p>
        ) : hospital ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              void handleLocationMasterSubmit(event);
            }}
          >
            <LocationMasterFormFields
              disabled={updateLocationMasterMutation.isPending}
              form={locationMasterForm}
            />
            <div className="flex justify-end">
              <SubmitButton
                isPending={updateLocationMasterMutation.isPending}
                label="Update Location"
              />
            </div>
          </form>
        ) : null}
      </Panel>

      <Panel className="p-4" id="locations">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-ds-text">Service Areas</h2>
          <p className="text-sm text-ds-muted">
            Add floors, buildings, and service areas under this location.
          </p>
        </div>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              error={form.formState.errors.locationName?.message}
              label="Location Name"
              name="hospital-location-name"
            >
              <Input id="hospital-location-name" {...form.register('locationName')} />
            </Field>
            <Field
              error={form.formState.errors.building?.message}
              label="Building"
              name="hospital-location-building"
            >
              <Input id="hospital-location-building" {...form.register('building')} />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              error={form.formState.errors.floor?.message}
              label="Floor"
              name="hospital-location-floor"
            >
              <Input id="hospital-location-floor" {...form.register('floor')} />
            </Field>
            <Field
              error={form.formState.errors.area?.message}
              label="Area"
              name="hospital-location-area"
            >
              <Input id="hospital-location-area" {...form.register('area')} />
            </Field>
            <Field
              error={form.formState.errors.address?.message}
              label="Address"
              name="hospital-location-address"
            >
              <Input id="hospital-location-address" {...form.register('address')} />
            </Field>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CheckboxLine
              input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
            >
              Active
            </CheckboxLine>
            <div className="flex gap-2">
              {editingLocation ? (
                <Button onClick={cancelEditingLocation} type="button" variant="outline">
                  Cancel
                </Button>
              ) : null}
              <SubmitButton
                isPending={saveLocationMutation.isPending}
                label={editingLocation ? 'Update Location' : 'Create Location'}
              />
            </div>
          </div>
        </form>
      </Panel>

      <Panel>
        <ToolbarGrid>
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
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="locationName">Location name</option>
            <option value="building">Building</option>
            <option value="floor">Floor</option>
            <option value="area">Area</option>
            <option value="createdAt">Created date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void locationsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </ToolbarGrid>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[24%] px-4 py-2.5">Location</th>
                <th className="w-[18%] px-4 py-2.5">Building</th>
                <th className="w-[14%] px-4 py-2.5">Floor</th>
                <th className="w-[16%] px-4 py-2.5">Area</th>
                <th className="w-[12%] px-4 py-2.5">Status</th>
                <th className="w-[16%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((location) => (
                  <tr className="hover:bg-ds-subtle" key={location.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-ds-text">{location.locationName}</p>
                        <p className="text-xs text-ds-muted">
                          Updated {formatDate(location.updatedAt)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{nullableText(location.building)}</td>
                    <td className="px-4 py-3 text-ds-text-3">{nullableText(location.floor)}</td>
                    <td className="px-4 py-3 text-ds-text-3">{nullableText(location.area)}</td>
                    <td className="px-4 py-3">
                      <StatusToggleCell
                        disabled={statusMutation.isPending}
                        isActive={location.isActive}
                        onToggle={() => toggleLocationStatus(location)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingLocation(location)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => setViewingLocation(location)}
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
                  colSpan={6}
                  error={locationsQuery.error}
                  isError={locationsQuery.isError}
                  isLoading={locationsQuery.isLoading}
                  label="locations"
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
        onClose={() => setViewingLocation(null)}
        rows={
          viewingLocation && [
            ['Location', viewingLocation.locationName],
            ['Building', nullableText(viewingLocation.building)],
            ['Floor', nullableText(viewingLocation.floor)],
            ['Area', nullableText(viewingLocation.area)],
            ['Address', nullableText(viewingLocation.address)],
            ['Status', <StatusBadge isActive={viewingLocation.isActive} key="status" />],
            ['Created', formatDate(viewingLocation.createdAt)],
            ['Updated', formatDate(viewingLocation.updatedAt)],
          ]
        }
        title="Location"
      />
    </section>
  );
}
