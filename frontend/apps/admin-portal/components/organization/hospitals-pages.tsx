'use client';

import Link from 'next/link';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { INDIAN_STATES, getCitiesForState } from '@/lib/india-locations';
import type {
  Hospital as HospitalRecord,
  HospitalInput,
  Location,
  LocationInput,
  SortOrder,
} from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, MapPin, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ActiveFilterSelect,
  CheckboxLine,
  FlexibleToolbar,
  FormShell,
  LocationMasterFormFields,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusBadge,
  StatusToggleCell,
  SubmitButton,
  ToolbarGrid,
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  freezeServicesMessage,
  getLocationCode,
  getLocationDisplayName,
  getLocationPostalCode,
  getLocationTitle,
  hospitalSchema,
  listLimit,
  locationSchema,
  nullableText,
  onlinePaymentOptions,
  optionalValue,
  toHospitalFormDefaults,
  toHospitalInput,
} from './shared';
import type {
  ActiveFilter,
  HospitalFormValues,
  LocationFormValues,
  OnlinePaymentFilter,
} from './shared';

export function HospitalsPageClient() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [onlinePaymentFilter, setOnlinePaymentFilter] = useState<OnlinePaymentFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const cityOptions = getCitiesForState(stateFilter);

  useEffect(() => {
    if (cityFilter && cityOptions.length > 0 && !cityOptions.includes(cityFilter)) {
      setCityFilter('');
    }
  }, [cityFilter, cityOptions]);

  const locationsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        city: cityFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        onlinePaymentOption: onlinePaymentFilter || undefined,
        page,
        search,
        sortBy,
        sortOrder,
        state: stateFilter || undefined,
      });

      return response.data;
    },
    queryKey: [
      'hospitals',
      {
        activeFilter,
        cityFilter,
        onlinePaymentFilter,
        page,
        search,
        sortBy,
        sortOrder,
        stateFilter,
      },
    ],
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateHospital(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setStatusUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: ['hospitals'] });
      void queryClient.invalidateQueries({ queryKey: ['hospital-options'] });
      showToast({
        title: variables.isActive ? 'Location activated' : 'Location deactivated',
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

  function toggleLocationStatus(location: HospitalRecord) {
    const nextIsActive = !location.isActive;

    if (!nextIsActive && !window.confirm(freezeServicesMessage)) {
      return;
    }

    setStatusUpdatingId(location.id);
    statusMutation.mutate({ id: location.id, isActive: nextIsActive });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <Button asChild>
            <Link href="/masters/locations/new">
              <Plus className="h-4 w-4" />
              Add Location
            </Link>
          </Button>
        }
        eyebrow="Masters"
        icon={MapPin}
        subtitle="Manage operating locations for food and cafeteria services."
        title="Locations"
      />
      <Panel>
        <FlexibleToolbar>
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={search}
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
              setStateFilter(event.target.value);
              setPage(1);
            }}
            value={stateFilter}
          >
            <option value="">All states</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
          <Select
            disabled={!stateFilter}
            onChange={(event) => {
              setCityFilter(event.target.value);
              setPage(1);
            }}
            value={cityFilter}
          >
            <option value="">All cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setOnlinePaymentFilter(event.target.value as OnlinePaymentFilter);
              setPage(1);
            }}
            value={onlinePaymentFilter}
          >
            <option value="">All payment options</option>
            {onlinePaymentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
            <option value="title">Name</option>
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
        </FlexibleToolbar>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[18%] px-4 py-2.5">Title</th>
                <th className="w-[13%] px-4 py-2.5">Location Code</th>
                <th className="w-[17%] px-4 py-2.5">Display Name</th>
                <th className="w-[12%] px-4 py-2.5">State</th>
                <th className="w-[12%] px-4 py-2.5">City</th>
                <th className="w-[10%] px-4 py-2.5">Postal Code</th>
                <th className="w-[12%] px-4 py-2.5">Online Payment</th>
                <th className="w-[18%] px-4 py-2.5">Status</th>
                <th className="w-[13%] px-4 py-2.5">Updated</th>
                <th className="w-[12%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((location) => (
                  <tr className="hover:bg-slate-50" key={location.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-950">{getLocationTitle(location)}</p>
                        <p className="line-clamp-1 text-xs text-slate-500">
                          {nullableText(location.address)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{getLocationCode(location)}</td>
                    <td className="px-4 py-3 text-slate-600">{getLocationDisplayName(location)}</td>
                    <td className="px-4 py-3 text-slate-600">{nullableText(location.state)}</td>
                    <td className="px-4 py-3 text-slate-600">{nullableText(location.city)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {nullableText(getLocationPostalCode(location))}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{location.onlinePaymentOption}</td>
                    <td className="px-4 py-3">
                      <StatusToggleCell
                        disabled={statusMutation.isPending && statusUpdatingId === location.id}
                        isActive={location.isActive}
                        onToggle={() => toggleLocationStatus(location)}
                        showFrozenMessage={!location.isActive}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(location.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/masters/hospitals/${location.id}/locations#details`}>
                          <Eye className="h-4 w-4" />
                          View/Edit
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={10}
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
    </section>
  );
}

export function HospitalLocationsPageClient({ hospitalId }: Readonly<{ hospitalId: string }>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [sortBy, setSortBy] = useState('locationName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
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
    queryKey: ['hospital', hospitalId],
  });

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
    queryKey: ['hospital-locations', hospitalId, { activeFilter, page, search, sortBy, sortOrder }],
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
      void queryClient.invalidateQueries({ queryKey: ['hospital-locations', hospitalId] });
      void queryClient.invalidateQueries({ queryKey: ['location-options', hospitalId] });
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
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
      void queryClient.invalidateQueries({ queryKey: ['hospital', hospitalId] });
      void queryClient.invalidateQueries({ queryKey: ['hospitals'] });
      void queryClient.invalidateQueries({ queryKey: ['hospital-options'] });
      locationMasterForm.reset(toHospitalFormDefaults(response.data));
      showToast({
        title: 'Location updated',
        variant: 'success',
      });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteLocation(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['hospital-locations', hospitalId] });
      void queryClient.invalidateQueries({ queryKey: ['location-options', hospitalId] });
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      showToast({
        title: 'Location deleted',
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

  const handleLocationMasterSubmit = locationMasterForm.handleSubmit((values) => {
    const parsed = hospitalSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(locationMasterForm, parsed.error);
      return;
    }

    updateLocationMasterMutation.mutate(toHospitalInput(parsed.data));
  });

  const handleSubmit = form.handleSubmit((values) => {
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

  function deleteLocation(location: Location) {
    const shouldDelete = window.confirm(`Delete ${location.locationName}?`);

    if (shouldDelete) {
      deleteLocationMutation.mutate(location.id);
    }
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
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">
              Add/Update Location
            </h2>
            <p className="text-sm text-slate-500">
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
          <p className="text-sm font-medium text-red-600">
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
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Service Areas</h2>
          <p className="text-sm text-slate-500">
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
            value={search}
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[24%] px-4 py-2.5">Location</th>
                <th className="w-[18%] px-4 py-2.5">Building</th>
                <th className="w-[14%] px-4 py-2.5">Floor</th>
                <th className="w-[16%] px-4 py-2.5">Area</th>
                <th className="w-[12%] px-4 py-2.5">Status</th>
                <th className="w-[16%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((location) => (
                  <tr className="hover:bg-slate-50" key={location.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-950">{location.locationName}</p>
                        <p className="text-xs text-slate-500">
                          Updated {formatDate(location.updatedAt)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{nullableText(location.building)}</td>
                    <td className="px-4 py-3 text-slate-600">{nullableText(location.floor)}</td>
                    <td className="px-4 py-3 text-slate-600">{nullableText(location.area)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={location.isActive} />
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
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={deleteLocationMutation.isPending}
                          onClick={() => deleteLocation(location)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
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
    </section>
  );
}

export function HospitalCreatePageClient() {
  const form = useForm<HospitalFormValues>({
    defaultValues: toHospitalFormDefaults(),
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const createHospitalMutation = useMutation({
    mutationFn: (body: HospitalInput) => organizationApi.createHospital(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['hospitals'] });
      void queryClient.invalidateQueries({ queryKey: ['hospital-options'] });
      showToast({
        description: 'Main Store and Main Kitchen were created automatically.',
        title: 'Location created',
        variant: 'success',
      });
      router.push('/masters/locations');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = hospitalSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createHospitalMutation.mutate(toHospitalInput(parsed.data));
  });

  return (
    <FormShell
      backHref="/masters/locations"
      icon={MapPin}
      subtitle="Creating a Location will auto-create Main Store and Main Kitchen."
      title="Add Location"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <LocationMasterFormFields disabled={createHospitalMutation.isPending} form={form} />
        <div className="flex justify-end">
          <SubmitButton isPending={createHospitalMutation.isPending} label="Save Location" />
        </div>
      </form>
    </FormShell>
  );
}
