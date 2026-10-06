'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type {
  ApiList,
  ApiResponse,
  ItemCategory,
  ItemCategoryInput,
  ListQuery,
  SortOrder,
} from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { IfCanOpen } from '@/components/record-link';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { invalidateItemCategoryQueries } from '@/lib/query-invalidation';
import {
  CategoryFormFields,
  categorySchema,
  similarCategoryError,
  type ItemCategoryFormValues,
} from '@/components/master-data/item-categories/shared';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusBadge,
  StatusToggleButton,
  SubmitButton,
} from '@/components/master-data/shared/components';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  listLimit,
} from '@/components/master-data/shared/utils';

function useEntityList<TItem>(
  entityKey: string,
  query: ListQuery,
  list: (query: ListQuery) => Promise<ApiResponse<ApiList<TItem>>>,
) {
  return useQuery({
    queryFn: async () => {
      const response = await list(query);

      return response.data;
    },
    queryKey: [entityKey, query],
  });
}

export function ItemCategoriesPageClient() {
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const form = useForm<ItemCategoryFormValues>({
    defaultValues: {
      categoryName: '',
      isActive: true,
    },
  });

  const categoriesQuery = useEntityList<ItemCategory>(
    'item-categories',
    {
      isActive: activeFilterToBoolean(activeFilter),
      limit: listLimit,
      page,
      search,
      sortBy,
      sortOrder,
    },
    (query) => organizationApi.listItemCategories(query),
  );

  const saveCategoryMutation = useMutation({
    mutationFn: (body: ItemCategoryInput) =>
      editingCategory
        ? organizationApi.updateItemCategory(editingCategory.id, body)
        : organizationApi.createItemCategory(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarCategoryError) {
        form.setError('categoryName', { message });
      }

      showToast({
        description: message,
        title: editingCategory ? 'Category was not updated' : 'Category was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemCategoryQueries(queryClient);
      showToast({
        title: editingCategory ? 'Category updated' : 'Category created',
        variant: 'success',
      });
      setEditingCategory(null);
      form.reset({
        categoryName: '',
        isActive: true,
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteItemCategory(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Category was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemCategoryQueries(queryClient);
      showToast({
        title: 'Category deleted',
        variant: 'success',
      });
    },
  });

  const toggleCategoryStatusMutation = useMutation({
    mutationFn: ({ category, isActive }: { category: ItemCategory; isActive: boolean }) =>
      organizationApi.updateItemCategory(category.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Category status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateItemCategoryQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Category activated' : 'Category marked inactive',
        variant: 'success',
      });
    },
  });

  const items = categoriesQuery.data?.items ?? [];
  const meta = categoriesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = categorySchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveCategoryMutation.mutate({
      categoryName: parsed.data.categoryName,
      isActive: parsed.data.isActive,
    });
  });

  function startEditingCategory(category: ItemCategory) {
    setEditingCategory(category);
    form.reset({
      categoryName: category.categoryName,
      isActive: category.isActive,
    });
  }

  function cancelEditingCategory() {
    setEditingCategory(null);
    form.reset({
      categoryName: '',
      isActive: true,
    });
  }

  function deleteCategory(category: ItemCategory) {
    const shouldDelete = window.confirm(`Delete ${category.categoryName}?`);

    if (shouldDelete) {
      deleteCategoryMutation.mutate(category.id);
    }
  }

  function toggleCategoryStatus(category: ItemCategory) {
    const nextIsActive = !category.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this category inactive will prevent it from being used for new items. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleCategoryStatusMutation.mutate({ category, isActive: nextIsActive });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <IfCanOpen href="/masters/item-categories/new">
            <Button asChild>
              <Link href="/masters/item-categories/new">
                <Plus className="h-4 w-4" />
                Create
              </Link>
            </Button>
          </IfCanOpen>
        }
        eyebrow="Master Data"
        icon={Tags}
        subtitle="Configure global item grouping reusable across hospitals."
        title="Item Categories"
      />

      {editingCategory ? (
        <Panel className="p-4">
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-normal text-ds-text">Edit Category</h2>
            <p className="text-sm text-ds-muted">Update category details and status.</p>
          </div>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <CategoryFormFields form={form} />
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button onClick={cancelEditingCategory} type="button" variant="outline">
                Cancel
              </Button>
              <SubmitButton isPending={saveCategoryMutation.isPending} label="Update Category" />
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_160px_180px_130px_auto]">
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
            <option value="createdAt">Created date</option>
            <option value="categoryName">Category name</option>
            <option value="updatedAt">Updated date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void categoriesQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[24%] px-4 py-2.5">Category Name</th>
                <th className="w-[11%] px-4 py-2.5">Status</th>
                <th className="w-[14%] px-4 py-2.5">Active / Inactive</th>
                <th className="w-[18%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[18%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[15%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((category) => (
                  <tr className="hover:bg-ds-subtle" key={category.id}>
                    <td className="px-4 py-3 font-medium text-ds-text">{category.categoryName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={category.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusToggleButton
                        isActive={category.isActive}
                        isPending={toggleCategoryStatusMutation.isPending}
                        onToggle={() => toggleCategoryStatus(category)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(category.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(category.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingCategory(category)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          className="border-ds-status-bad-fg/25 text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
                          disabled={deleteCategoryMutation.isPending}
                          onClick={() => deleteCategory(category)}
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
                  error={categoriesQuery.error}
                  isError={categoriesQuery.isError}
                  isLoading={categoriesQuery.isLoading}
                  label="item categories"
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
