'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IndianRupee } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ItemPriceInput } from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { invalidateItemPriceQueries } from '@/lib/query-invalidation';
import {
  ItemPriceFormFields,
  emptyItemPriceFormValues,
  getItemPriceItemOptions,
  itemPriceSchema,
  overlappingItemPriceError,
  toItemPricePayload,
  useItemOptions,
  type ItemPriceFormValues,
} from '@/components/master-data/item-prices/shared';
import {
  useHospitalOptions,
  useRestaurantOptions,
} from '@/components/master-data/item-prices/options';
import { FormShell, SubmitButton } from '@/components/master-data/shared/components';
import { applyValidationErrors } from '@/components/master-data/shared/utils';

export function ItemPriceCreatePageClient() {
  const { isAllLocations, scopedHospitalId } = useLocationContext();
  const form = useForm<ItemPriceFormValues>({
    defaultValues: emptyItemPriceFormValues(),
  });
  const [itemSearch, setItemSearch] = useState('');
  const selectedHospitalId = form.watch('hospitalId');
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(selectedHospitalId);
  const itemOptionsQuery = useItemOptions(undefined, itemSearch, selectedHospitalId);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('restaurantId', '', { shouldValidate: true });
    }
  }, [form, scopedHospitalId]);

  const createItemPriceMutation = useMutation({
    mutationFn: (body: ItemPriceInput) => organizationApi.createItemPrice(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === overlappingItemPriceError) {
        form.setError('effectiveFrom', { message });
      }

      showToast({
        description: message,
        title: 'Item price was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/item-prices', { name: response.data.item.itemName });
      invalidateItemPriceQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.item.itemName}` },
        title: 'Item price created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const formValues = form.watch();
  const canSubmit =
    Boolean(formValues.hospitalId) &&
    Boolean(formValues.itemId) &&
    Boolean(formValues.rateType) &&
    Number(formValues.price) > 0 &&
    (!formValues.isTaxInclusive || Boolean(formValues.gstPercent)) &&
    Boolean(formValues.effectiveFrom);

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = itemPriceSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createItemPriceMutation.mutate(toItemPricePayload(parsed.data));
  });

  return (
    <FormShell
      backHref="/masters/item-prices"
      icon={IndianRupee}
      subtitle="Create a sale price for a location, optional restaurant, item, and rate type."
      title="Create Item Price"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <ItemPriceFormFields
          form={form}
          hospitals={hospitalsQuery.data}
          isLocationLocked={!isAllLocations}
          isItemsLoading={itemOptionsQuery.isLoading}
          itemSearch={itemSearch}
          items={getItemPriceItemOptions(itemOptionsQuery.data)}
          onItemSearch={setItemSearch}
          restaurants={restaurantsQuery.data}
        />
        {hospitalsQuery.isError || restaurantsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            {getApiErrorMessage(hospitalsQuery.error ?? restaurantsQuery.error)}
          </p>
        ) : null}
        {itemOptionsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            Unable to load active items. Please try searching again or refresh the page.
          </p>
        ) : null}
        {!formValues.itemId && !itemOptionsQuery.isLoading && !itemOptionsQuery.data?.length ? (
          <div className="rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
            {itemSearch
              ? 'No active items match your search.'
              : 'Create an active item before creating item prices.'}
          </div>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmit}
            isPending={createItemPriceMutation.isPending}
            label="Create Item Price"
          />
        </div>
      </form>
    </FormShell>
  );
}
