'use client';

import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Field, FieldError, Input, Label, Select } from '@/components/ui';
import { getCitiesForState, INDIAN_STATES } from '@/lib/india-locations';
import { CheckboxLine, Textarea } from '@/components/organization/shared/form-controls';
import { SectionHeading } from '@/components/organization/shared/list-controls';
import { onlinePaymentOptions } from '@/components/organization/shared/locations';
import type { HospitalFormValues } from '@/components/organization/shared/types';

export function LocationMasterFormFields({
  disabled = false,
  form,
}: Readonly<{
  disabled?: boolean;
  form: UseFormReturn<HospitalFormValues>;
}>) {
  const selectedState = form.watch('state');
  const selectedCity = form.watch('city');
  const cityOptions = getCitiesForState(selectedState);

  useEffect(() => {
    if (selectedCity && cityOptions.length > 0 && !cityOptions.includes(selectedCity)) {
      form.setValue('city', '');
    }
  }, [cityOptions, form, selectedCity]);

  return (
    <div className="grid gap-6">
      <SectionHeading title="Add/Update Location" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field error={form.formState.errors.title?.message} label="Title" name="location-title">
          <Input disabled={disabled} id="location-title" {...form.register('title')} />
        </Field>
        <Field
          error={form.formState.errors.locationCode?.message}
          label="Location Code"
          name="location-code"
        >
          <Input
            disabled={disabled}
            id="location-code"
            placeholder="DEL-01"
            {...form.register('locationCode')}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          error={form.formState.errors.displayName?.message}
          label="Display Name"
          name="location-display-name"
        >
          <Input disabled={disabled} id="location-display-name" {...form.register('displayName')} />
        </Field>
        <Field
          error={form.formState.errors.invoicePrefix?.message}
          label="Invoice Prefix"
          name="location-invoice-prefix"
        >
          <Input
            disabled={disabled}
            id="location-invoice-prefix"
            placeholder="eg. MAX-LKO or INV-LKO"
            {...form.register('invoicePrefix')}
          />
        </Field>
      </div>
      <Field error={form.formState.errors.address?.message} label="Address" name="location-address">
        <Textarea disabled={disabled} id="location-address" {...form.register('address')} />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field error={form.formState.errors.state?.message} label="State" name="location-state">
          <Select disabled={disabled} id="location-state" {...form.register('state')}>
            <option value="">Select state</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        </Field>
        <Field error={form.formState.errors.city?.message} label="City" name="location-city">
          <Select
            disabled={disabled || !selectedState}
            id="location-city"
            {...form.register('city')}
          >
            <option value="">Select city</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.postalCode?.message}
          label="Postal Code"
          name="location-postal-code"
        >
          <Input
            disabled={disabled}
            id="location-postal-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="226010"
            {...form.register('postalCode')}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field error={form.formState.errors.latitude?.message} label="Latitude" name="latitude">
          <Input disabled={disabled} id="latitude" {...form.register('latitude')} />
        </Field>
        <Field error={form.formState.errors.longitude?.message} label="Longitude" name="longitude">
          <Input disabled={disabled} id="longitude" {...form.register('longitude')} />
        </Field>
        <Field error={form.formState.errors.area?.message} label="Area" name="location-area">
          <Input
            disabled={disabled}
            id="location-area"
            placeholder="0"
            {...form.register('area')}
          />
        </Field>
        <Field
          error={form.formState.errors.ipAddress?.message}
          label="IP Address"
          name="location-ip-address"
        >
          <Input disabled={disabled} id="location-ip-address" {...form.register('ipAddress')} />
        </Field>
      </div>
      <Field
        error={form.formState.errors.visitingCardAddress?.message}
        label="Address for Visiting Card"
        name="visiting-card-address"
      >
        <Textarea
          disabled={disabled}
          id="visiting-card-address"
          {...form.register('visitingCardAddress')}
        />
      </Field>
      <div className="space-y-3">
        <Label className="block" htmlFor="online-payment-option">
          Online Payment Option
        </Label>
        <div className="grid gap-3 sm:grid-cols-3" id="online-payment-option">
          {onlinePaymentOptions.map((option) => (
            <CheckboxLine
              input={
                <input
                  className="h-4 w-4"
                  disabled={disabled}
                  type="radio"
                  value={option.value}
                  {...form.register('onlinePaymentOption')}
                />
              }
              key={option.value}
            >
              {option.label}
            </CheckboxLine>
          ))}
        </div>
        <FieldError>{form.formState.errors.onlinePaymentOption?.message}</FieldError>
      </div>
      <CheckboxLine
        input={
          <input
            className="h-4 w-4"
            disabled={disabled}
            type="checkbox"
            {...form.register('isActive')}
          />
        }
      >
        Active
      </CheckboxLine>
    </div>
  );
}
