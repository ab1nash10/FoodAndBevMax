'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tags } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { ItemCategoryInput } from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { invalidateItemCategoryQueries } from '@/lib/query-invalidation';
import {
  CategoryFormFields,
  categorySchema,
  similarCategoryError,
  type ItemCategoryFormValues,
} from '@/components/master-data/item-categories/shared';
import { FormShell, SubmitButton } from '@/components/master-data/shared/components';
import { applyValidationErrors } from '@/components/master-data/shared/utils';

export function ItemCategoryCreatePageClient() {
  const form = useForm<ItemCategoryFormValues>({
    defaultValues: {
      categoryName: '',
      isActive: true,
    },
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const createCategoryMutation = useMutation({
    mutationFn: (body: ItemCategoryInput) => organizationApi.createItemCategory(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarCategoryError) {
        form.setError('categoryName', { message });
      }

      showToast({
        description: message,
        title: 'Category was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/item-categories', { name: response.data.categoryName });
      invalidateItemCategoryQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.categoryName}` },
        title: 'Category created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = categorySchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createCategoryMutation.mutate({
      categoryName: parsed.data.categoryName,
      isActive: parsed.data.isActive,
    });
  });

  return (
    <FormShell
      backHref="/masters/item-categories"
      icon={Tags}
      subtitle="Create a global category reusable across hospitals."
      title="Create Item Category"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <CategoryFormFields form={form} />
        <div className="flex justify-end">
          <SubmitButton
            disabled={!form.watch('categoryName')?.trim()}
            isPending={createCategoryMutation.isPending}
            label="Create Category"
          />
        </div>
      </form>
    </FormShell>
  );
}
