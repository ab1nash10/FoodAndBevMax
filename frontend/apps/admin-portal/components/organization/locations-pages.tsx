'use client';

import { useToast } from '@/components/toast-provider';
import { Field, Input, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { Location, LocationInput } from '@aahar/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import {
  CheckboxLine,
  EntityListPage,
  FormShell,
  FormWarning,
  SubmitButton,
  applyValidationErrors,
  formatLocationOption,
  getLocationDisplayName,
  locationSchema,
  nullableText,
  optionalValue,
  useHospitalOptions,
} from './shared';
import type { LocationFormValues } from './shared';

export function LocationsPageClient() {
  return (
    <EntityListPage<Location>
      config={{
        columns: [
          {
            className: 'w-[28%]',
            header: 'Location',
            render: (location) => (
              <div>
                <p className="font-medium text-slate-950">{location.locationName}</p>
                <p className="text-xs text-slate-500">{nullableText(location.area)}</p>
              </div>
            ),
          },
          {
            className: 'w-[24%]',
            header: 'Location',
            render: (location) => getLocationDisplayName(location.hospital),
          },
          {
            className: 'w-[18%]',
            header: 'Building',
            render: (location) => nullableText(location.building),
          },
          {
            className: 'w-[16%]',
            header: 'Floor',
            render: (location) => nullableText(location.floor),
          },
        ],
        createHref: '/masters/locations/new',
        emptyLabel: 'locations',
        entityKey: 'locations',
        icon: MapPin,
        list: (query) => organizationApi.listLocations(query),
        sortOptions: [
          { label: 'Created date', value: 'createdAt' },
          { label: 'Location name', value: 'locationName' },
          { label: 'Building', value: 'building' },
          { label: 'Floor', value: 'floor' },
          { label: 'Area', value: 'area' },
          { label: 'Status', value: 'isActive' },
        ],
        subtitle: 'Manage campus, floor, and service areas.',
        title: 'Service Areas',
      }}
    />
  );
}

export function LocationCreatePageClient() {
  const form = useForm<LocationFormValues>({
    defaultValues: {
      address: '',
      area: '',
      building: '',
      floor: '',
      hospitalId: '',
      isActive: true,
      locationName: '',
    },
  });
  const hospitalOptionsQuery = useHospitalOptions();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const createLocationMutation = useMutation({
    mutationFn: (body: LocationInput) => organizationApi.createLocation(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      void queryClient.invalidateQueries({ queryKey: ['location-options'] });
      showToast({
        title: 'Location created',
        variant: 'success',
      });
      router.push('/masters/locations');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = locationSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createLocationMutation.mutate({
      address: optionalValue(parsed.data.address),
      area: optionalValue(parsed.data.area),
      building: optionalValue(parsed.data.building),
      floor: optionalValue(parsed.data.floor),
      hospitalId: parsed.data.hospitalId,
      isActive: parsed.data.isActive,
      locationName: parsed.data.locationName,
    });
  });

  return (
    <FormShell
      backHref="/masters/locations"
      icon={MapPin}
      subtitle="Create a service area under an active location."
      title="Create Service Area"
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <Field
          error={form.formState.errors.hospitalId?.message}
          label="Location"
          name="location-hospital"
        >
          <Select
            disabled={hospitalOptionsQuery.isLoading}
            id="location-hospital"
            {...form.register('hospitalId')}
          >
            <option value="">Select location</option>
            {hospitalOptionsQuery.data?.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {formatLocationOption(hospital)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            error={form.formState.errors.locationName?.message}
            label="Location Name"
            name="location-name"
          >
            <Input id="location-name" {...form.register('locationName')} />
          </Field>
          <Field
            error={form.formState.errors.building?.message}
            label="Building"
            name="location-building"
          >
            <Input id="location-building" {...form.register('building')} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field error={form.formState.errors.floor?.message} label="Floor" name="location-floor">
            <Input id="location-floor" {...form.register('floor')} />
          </Field>
          <Field error={form.formState.errors.area?.message} label="Area" name="location-area">
            <Input id="location-area" {...form.register('area')} />
          </Field>
        </div>
        <Field
          error={form.formState.errors.address?.message}
          label="Address"
          name="location-address"
        >
          <Input id="location-address" {...form.register('address')} />
        </Field>
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
        <FormWarning
          isVisible={hospitalOptionsQuery.isError}
          message={getApiErrorMessage(hospitalOptionsQuery.error)}
        />
        <div className="flex justify-end">
          <SubmitButton isPending={createLocationMutation.isPending} label="Create Location" />
        </div>
      </form>
    </FormShell>
  );
}
