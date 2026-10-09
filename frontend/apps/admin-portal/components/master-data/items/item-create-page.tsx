'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { ItemInput } from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { invalidateItemQueries } from '@/lib/query-invalidation';
import {
  ItemFormFields,
  emptyItemFormValues,
  similarItemError,
  useItemCategoryOptions,
  type ItemFormValues,
} from '@/components/master-data/items/shared';
import { itemSchema } from '@/components/master-data/items/item-schema';
import { FormShell, SubmitButton } from '@/components/master-data/shared/components';
import { applyValidationErrors, optionalValue } from '@/components/master-data/shared/utils';

export function ItemCreatePageClient() {
  const form = useForm<ItemFormValues>({
    defaultValues: emptyItemFormValues(),
  });
  const categoryOptionsQuery = useItemCategoryOptions();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const createItemMutation = useMutation({
    mutationFn: (body: ItemInput) => organizationApi.createItem(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarItemError) {
        form.setError('itemName', { message });
      }

      showToast({
        description: message,
        title: 'Item was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/items', { id: response.data.id });
      invalidateItemQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.itemName}` },
        description: `Generated item code: ${response.data.itemCode}`,
        title: 'Item created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  // Only the fields this reads, so typing elsewhere in the form does not re-render the page.
  const [categoryId, itemName, itemType, type] = form.watch([
    'categoryId',
    'itemName',
    'itemType',
    'type',
  ]);
  const formValues = { categoryId, itemName, itemType, type };
  const canSubmit =
    Boolean(formValues.categoryId) &&
    Boolean(formValues.itemName?.trim()) &&
    Boolean(formValues.itemType) &&
    Boolean(formValues.type) &&
    !categoryOptionsQuery.isLoading &&
    Boolean(categoryOptionsQuery.data?.length);

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = itemSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createItemMutation.mutate({
      categoryId: parsed.data.categoryId,
      hsnCode: optionalValue(parsed.data.hsnCode),
      isActive: parsed.data.isActive,
      itemName: parsed.data.itemName,
      itemType: parsed.data.itemType,
      preparationTimeMinutes: parsed.data.preparationTimeMinutes,
      type: parsed.data.type,
    });
  });

  return (
    <FormShell
      backHref="/masters/items"
      icon={PackageOpen}
      subtitle="Create a global item for future menu, inventory, and billing workflows."
      title="Create Item"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <ItemFormFields categories={categoryOptionsQuery.data} form={form} />
        {categoryOptionsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            {getApiErrorMessage(categoryOptionsQuery.error)}
          </p>
        ) : null}
        {!categoryOptionsQuery.isLoading && !categoryOptionsQuery.data?.length ? (
          <div className="rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
            Create an item category before creating an item.
          </div>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmit}
            isPending={createItemMutation.isPending}
            label="Create Item"
          />
        </div>
      </form>
    </FormShell>
  );
}
