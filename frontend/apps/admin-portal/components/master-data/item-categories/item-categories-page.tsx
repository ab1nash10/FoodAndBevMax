'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
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
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  activeStatus,
  CsvImportExport,
  fetchAllPages,
  nameKey,
  type CsvColumn,
  type CsvRowImporter,
} from '@/components/csv-import-export';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import {
  AppPageHeader,
  DateTimeCell,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Panel } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { IfCanOpen } from '@/components/record-link';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { useUndoable } from '@/lib/use-undoable';
import { invalidateItemCategoryQueries } from '@/lib/query-invalidation';
import {
  CategoryFormFields,
  categorySchema,
  similarCategoryError,
  type ItemCategoryFormValues,
} from '@/components/master-data/item-categories/shared';
import {
  ActiveFilterSelect,
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/master-data/shared/components';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  listLimit,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const categoryColumns: Array<CsvColumn<ItemCategory>> = [
  { header: 'Category name', value: (category) => category.categoryName },
  { header: 'Status', value: (category) => (category.isActive ? 'Active' : 'Inactive') },
];

/**
 * A row whose name matches a category (ignoring case, spaces and punctuation, as the server
 * does) updates it, renaming it to the row's spelling; any other name adds one.
 */
async function startCategoryImport(): Promise<CsvRowImporter> {
  const existing = await fetchAllPages((page) =>
    organizationApi.listItemCategories({ limit: 100, page }),
  );
  const byName = new Map(existing.map((category) => [nameKey(category.categoryName), category]));

  return async (cells) => {
    const categoryName = cells('Category name');

    if (!categoryName) {
      throw new Error('Category name is required');
    }

    const match = byName.get(nameKey(categoryName));
    const isActive = activeStatus(cells('Status'), match?.isActive ?? true);

    if (match) {
      await organizationApi.updateItemCategory(match.id, { categoryName, isActive });

      return 'updated';
    }

    const { data } = await organizationApi.createItemCategory({ categoryName, isActive });

    // A second row with the same name in this file updates it rather than adding a twin.
    byName.set(nameKey(categoryName), data);

    return 'created';
  };
}

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
  const { hasPermission } = useAuth();

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
      // Marking inactive already had its Undo toast.
      if (variables.isActive) showToast({ title: 'Category activated', variant: 'success' });
    },
  });
  const undoable = useUndoable();

  // The strip's counts: under the list's own key, so every save refreshes them too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (await organizationApi.listItemCategories({ isActive, limit: 0 })).data.meta.total;
      const [all, active, inactive] = await Promise.all([count(), count(true), count(false)]);

      return { active, all, inactive };
    },
    queryKey: queryKeys.itemCategories('stats'),
  });
  const stats = statsQuery.data;
  const canEditCategories = hasPermission('ITEM_CATEGORY_UPDATE');

  // A category marked inactive shows so at once, while its Undo toast runs.
  const items = (categoriesQuery.data?.items ?? []).map((category) =>
    undoable.isChanged(category.id) ? { ...category, isActive: false } : category,
  );
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

  const hasFilters = Boolean(searchInput || activeFilter);

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setPage(1);
  }

  /** A stat's status filter alone. */
  function showStatus(status: ActiveFilter) {
    setActiveFilter(status);
    setPage(1);
  }

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

  function toggleCategoryStatus(category: ItemCategory) {
    // Switching it back on while the Undo toast runs is the same as Undo.
    if (undoable.undo(category.id)) return;

    if (category.isActive) {
      undoable.schedule({
        commit: () => toggleCategoryStatusMutation.mutateAsync({ category, isActive: false }),
        description: 'It can’t be used for new items. Existing records stay visible.',
        id: category.id,
        title: `${category.categoryName} marked inactive`,
      });
      return;
    }

    toggleCategoryStatusMutation.mutate({ category, isActive: true });
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <CsvImportExport
              columns={categoryColumns}
              exportRows={() =>
                fetchAllPages((exportPage) =>
                  organizationApi.listItemCategories({
                    isActive: activeFilterToBoolean(activeFilter),
                    limit: 100,
                    page: exportPage,
                    search,
                    sortBy,
                    sortOrder,
                  }),
                )
              }
              filename="item-categories"
              noun="item categories"
              onImported={() => invalidateItemCategoryQueries(queryClient)}
              startImport={hasPermission('ITEM_CATEGORY_CREATE') ? startCategoryImport : undefined}
            />
            <IfCanOpen href="/masters/item-categories/new">
              <Button asChild>
                <Link href="/masters/item-categories/new">
                  <Plus className="h-4 w-4" />
                  New category
                </Link>
              </Button>
            </IfCanOpen>
          </div>
        }
        count={stats?.all}
        description="Configure global item grouping reusable across hospitals."
        title="Item Categories"
      />

      <StatStrip
        label="Item categories at a glance"
        stats={[
          {
            active: !activeFilter,
            label: 'All categories',
            onSelect: () => showStatus(''),
            value: stats?.all ?? '–',
          },
          {
            active: activeFilter === 'active',
            label: 'Active',
            onSelect: () => showStatus('active'),
            tone: 'ok',
            value: stats?.active ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive',
            onSelect: () => showStatus('inactive'),
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />

      <Modal
        side
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={cancelEditingCategory} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saveCategoryMutation.isPending} form="category-form" type="submit">
              {saveCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        }
        onClose={cancelEditingCategory}
        open={editingCategory !== null}
        title="Edit category"
      >
        <form
          className="grid gap-4"
          id="category-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <CategoryFormFields form={form} />
        </form>
      </Modal>

      <Panel aria-label="Item category list" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search categories"
            placeholder="Category name"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu activeCount={activeFilter ? 1 : 0}>
            <FilterField label="Status">
              <ActiveFilterSelect
                onChange={(value) => {
                  setActiveFilter(value);
                  setPage(1);
                }}
                value={activeFilter}
              />
            </FilterField>
          </FiltersMenu>
          <SortControl
            onOrderChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            onSortByChange={(value) => {
              setSortBy(value);
              setPage(1);
            }}
            options={[
              { label: 'Created date', value: 'createdAt' },
              { label: 'Category name', value: 'categoryName' },
              { label: 'Updated date', value: 'updatedAt' },
              { label: 'Status', value: 'isActive' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void categoriesQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[720px] table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[38%]')}>Category</th>
                <th className={cn(tableStyles.th, 'w-[19%]')}>Created</th>
                <th className={cn(tableStyles.th, 'w-[19%]')}>Updated</th>
                <th className={cn(tableStyles.th, 'w-[17%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-[7%]')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((category) => (
                  <tr
                    className={cn(tableStyles.row, !canEditCategories && 'cursor-default')}
                    key={category.id}
                    onClick={canEditCategories ? () => startEditingCategory(category) : undefined}
                  >
                    <td className={cn(tableStyles.td, tableStyles.title, 'truncate')}>
                      {category.categoryName}
                    </td>
                    <td className={tableStyles.td}>
                      <DateTimeCell value={category.createdAt} />
                    </td>
                    <td className={tableStyles.td}>
                      <DateTimeCell value={category.updatedAt} />
                    </td>
                    {/* Its own click: switching the status does not open the category. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <span className="flex items-center gap-2">
                        <Toggle
                          ariaLabel={`${category.categoryName} active`}
                          checked={category.isActive}
                          disabled={toggleCategoryStatusMutation.isPending}
                          onChange={() => toggleCategoryStatus(category)}
                        />
                        <span
                          className={cn(
                            'text-xs font-bold',
                            category.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                          )}
                        >
                          {category.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end">
                        {canEditCategories ? (
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${category.categoryName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditingCategory(category);
                            }}
                          />
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={5}
                  error={categoriesQuery.error}
                  isError={categoriesQuery.isError}
                  isLoading={categoriesQuery.isLoading}
                  atLocation={false}
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
