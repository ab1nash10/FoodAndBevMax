'use client';

import { useToast } from '@/components/toast-provider';
import { Field, Input, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { Counter, CounterInput } from '@aahar/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import {
  CheckboxLine,
  EntityListPage,
  FormShell,
  FormWarning,
  SubmitButton,
  applyValidationErrors,
  counterSchema,
  formatLocationOption,
  getLocationDisplayName,
  nullableText,
  optionalValue,
  useHospitalOptions,
  useRestaurantOptions,
} from './shared';
import type { CounterFormValues } from './shared';

export function CountersPageClient() {
  return (
    <EntityListPage<Counter>
      config={{
        columns: [
          {
            className: 'w-[26%]',
            header: 'Counter',
            render: (counter) => (
              <div>
                <p className="font-medium text-ds-text">{counter.counterName}</p>
                <p className="text-xs text-ds-muted">{counter.counterCode}</p>
              </div>
            ),
          },
          {
            className: 'w-[22%]',
            header: 'Restaurant',
            render: (counter) => counter.restaurant.restaurantName,
          },
          {
            className: 'w-[20%]',
            header: 'Location',
            render: (counter) => getLocationDisplayName(counter.hospital),
          },
          {
            className: 'w-[18%]',
            header: 'POS Device',
            render: (counter) => nullableText(counter.posDeviceId),
          },
        ],
        createHref: '/masters/counters/new',
        emptyLabel: 'counters',
        entityKey: 'counters',
        icon: CreditCard,
        list: (query) => organizationApi.listCounters(query),
        sortOptions: [
          { label: 'Created date', value: 'createdAt' },
          { label: 'Counter name', value: 'counterName' },
          { label: 'Counter code', value: 'counterCode' },
          { label: 'Status', value: 'isActive' },
        ],
        subtitle: 'Manage restaurant counters and POS points.',
        title: 'Counters',
      }}
    />
  );
}

export function CounterCreatePageClient() {
  const form = useForm<CounterFormValues>({
    defaultValues: {
      counterCode: '',
      counterName: '',
      hospitalId: '',
      isActive: true,
      paymentDeviceId: '',
      pineLabsDeviceId: '',
      posDeviceId: '',
      restaurantId: '',
    },
  });
  const hospitalId = form.watch('hospitalId');
  const hospitalOptionsQuery = useHospitalOptions();
  const restaurantOptionsQuery = useRestaurantOptions(hospitalId);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const createCounterMutation = useMutation({
    mutationFn: (body: CounterInput) => organizationApi.createCounter(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Counter was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['counters'] });
      showToast({
        title: 'Counter created',
        variant: 'success',
      });
      router.push('/masters/counters');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = counterSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createCounterMutation.mutate({
      counterCode: parsed.data.counterCode,
      counterName: parsed.data.counterName,
      hospitalId: parsed.data.hospitalId,
      isActive: parsed.data.isActive,
      paymentDeviceId: optionalValue(parsed.data.paymentDeviceId),
      pineLabsDeviceId: optionalValue(parsed.data.pineLabsDeviceId),
      posDeviceId: optionalValue(parsed.data.posDeviceId),
      restaurantId: parsed.data.restaurantId,
    });
  });

  return (
    <FormShell
      backHref="/masters/counters"
      icon={CreditCard}
      subtitle="Create a counter for restaurant billing and service."
      title="Create Counter"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={form.formState.errors.hospitalId?.message}
            label="Location"
            name="counter-hospital"
          >
            <Select
              disabled={hospitalOptionsQuery.isLoading}
              id="counter-hospital"
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
          <Field
            error={form.formState.errors.restaurantId?.message}
            label="Restaurant"
            name="counter-restaurant"
          >
            <Select
              disabled={!hospitalId || restaurantOptionsQuery.isLoading}
              id="counter-restaurant"
              {...form.register('restaurantId')}
            >
              <option value="">Select restaurant</option>
              {restaurantOptionsQuery.data?.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.restaurantName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={form.formState.errors.counterName?.message}
            label="Counter Name"
            name="counter-name"
          >
            <Input id="counter-name" {...form.register('counterName')} />
          </Field>
          <Field
            error={form.formState.errors.counterCode?.message}
            label="Counter Code"
            name="counter-code"
          >
            <Input id="counter-code" {...form.register('counterCode')} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            error={form.formState.errors.posDeviceId?.message}
            label="POS Device ID"
            name="counter-pos-device"
          >
            <Input id="counter-pos-device" {...form.register('posDeviceId')} />
          </Field>
          <Field
            error={form.formState.errors.paymentDeviceId?.message}
            label="Payment Device ID"
            name="counter-payment-device"
          >
            <Input id="counter-payment-device" {...form.register('paymentDeviceId')} />
          </Field>
          <Field
            error={form.formState.errors.pineLabsDeviceId?.message}
            label="Pine Labs Device ID"
            name="counter-pinelabs-device"
          >
            <Input id="counter-pinelabs-device" {...form.register('pineLabsDeviceId')} />
          </Field>
        </div>
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
        <FormWarning
          isVisible={hospitalOptionsQuery.isError || restaurantOptionsQuery.isError}
          message={getApiErrorMessage(hospitalOptionsQuery.error ?? restaurantOptionsQuery.error)}
        />
        <div className="flex justify-end">
          <SubmitButton isPending={createCounterMutation.isPending} label="Create Counter" />
        </div>
      </form>
    </FormShell>
  );
}
