'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IndianRupee } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ItemPrice, ItemPriceInput } from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Skeleton } from '@/components/ui';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { invalidateItemPriceQueries } from '@/lib/query-invalidation';
import {
  ItemPriceFormFields,
  emptyItemPriceFormValues,
  formatItemPriceItemLabel,
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
import { applyValidationErrors, skeletonRows } from '@/components/master-data/shared/utils';
import { itemPriceDetailQuery } from '@/lib/detail-queries';

function itemPriceToFormValues(itemPrice: ItemPrice): ItemPriceFormValues {
  return {
    effectiveFrom: itemPrice.effectiveFrom.slice(0, 10),
    effectiveTo: itemPrice.effectiveTo?.slice(0, 10) ?? '',
    gstPercent: itemPrice.gstPercent === null ? '' : String(itemPrice.gstPercent),
    hospitalId: itemPrice.hospitalId,
    isActive: itemPrice.isActive,
    isTaxInclusive: itemPrice.isTaxInclusive,
    itemId: itemPrice.itemId,
    price: String(itemPrice.price),
    rateType: itemPrice.rateType,
    restaurantId: itemPrice.restaurantId ?? '',
  };
}

export function ItemPriceEditPageClient({ itemPriceId }: Readonly<{ itemPriceId: string }>) {
  const { isLocationSelectorLocked } = useLocationContext();
  const form = useForm<ItemPriceFormValues>({
    defaultValues: emptyItemPriceFormValues(),
  });
  const [itemSearch, setItemSearch] = useState('');
  const selectedHospitalId = form.watch('hospitalId');
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(selectedHospitalId);
  const itemOptionsQuery = useItemOptions(undefined, itemSearch);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const itemPriceQuery = useQuery(itemPriceDetailQuery(itemPriceId));
  useBreadcrumbLabel(
    itemPriceId,
    itemPriceQuery.data?.item.itemName ?? (itemPriceQuery.isError ? 'Not found' : undefined),
  );

  useEffect(() => {
    if (itemPriceQuery.data) {
      form.reset(itemPriceToFormValues(itemPriceQuery.data));
      setItemSearch(formatItemPriceItemLabel(itemPriceQuery.data.item));
    }
  }, [form, itemPriceQuery.data]);

  const updateItemPriceMutation = useMutation({
    mutationFn: (body: ItemPriceInput) => organizationApi.updateItemPrice(itemPriceId, body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === overlappingItemPriceError) {
        form.setError('effectiveFrom', { message });
      }

      showToast({
        description: message,
        title: 'Item price was not updated',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/item-prices', { name: response.data.item.itemName });
      invalidateItemPriceQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.item.itemName}` },
        title: 'Item price updated',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = itemPriceSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    updateItemPriceMutation.mutate(toItemPricePayload(parsed.data));
  });

  if (itemPriceQuery.isLoading) {
    return (
      <FormShell
        backHref="/masters/item-prices"
        icon={IndianRupee}
        subtitle="Loading sale price details."
        title="Edit Item Price"
      >
        <div className="grid gap-4">
          {skeletonRows.map((row) => (
            <Skeleton className="h-10 w-full" key={row} />
          ))}
        </div>
      </FormShell>
    );
  }

  if (itemPriceQuery.isError) {
    return (
      <FormShell
        backHref="/masters/item-prices"
        icon={IndianRupee}
        subtitle="Unable to load sale price details."
        title="Edit Item Price"
      >
        <div className="rounded-md border border-ds-status-bad-fg/25 bg-ds-status-bad-bg p-4 text-sm font-medium text-ds-status-bad-fg">
          {getApiErrorMessage(itemPriceQuery.error)}
        </div>
      </FormShell>
    );
  }

  return (
    <FormShell
      backHref="/masters/item-prices"
      icon={IndianRupee}
      subtitle="Update sale pricing and effective date range."
      title="Edit Item Price"
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
          isLocationLocked={isLocationSelectorLocked}
          isItemsLoading={itemOptionsQuery.isLoading}
          itemSearch={itemSearch}
          items={getItemPriceItemOptions(itemOptionsQuery.data, itemPriceQuery.data?.item)}
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
        {!form.watch('itemId') && !itemOptionsQuery.isLoading && !itemOptionsQuery.data?.length ? (
          <div className="rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
            {itemSearch
              ? 'No active items match your search.'
              : 'Create an active item before creating item prices.'}
          </div>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton isPending={updateItemPriceMutation.isPending} label="Update Item Price" />
        </div>
      </form>
    </FormShell>
  );
}
