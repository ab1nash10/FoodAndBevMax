'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronsUp, GripVertical, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ItemCategory } from '@aahar/api-client';
import { fetchAllPages } from '@/components/csv-import-export';
import { RecordAvatar } from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Skeleton } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateItemCategoryQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

/** Moves the entry at `from` to `to`, shifting the ones between. */
function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry!);
  return next;
}

/**
 * The order categories come in on menus, the till and the kiosk: dragged into place (desktop) or
 * moved with the arrow buttons (any device, and the keyboard), then saved as a whole.
 */
export function ArrangeCategories({
  onClose,
  open,
}: Readonly<{ onClose: () => void; open: boolean }>) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [order, setOrder] = useState<ItemCategory[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    enabled: open,
    queryFn: () =>
      fetchAllPages((page) =>
        organizationApi.listItemCategories({
          limit: 100,
          page,
          sortBy: 'sortOrder',
          sortOrder: 'asc',
        }),
      ),
    queryKey: queryKeys.itemCategories('arrange'),
  });

  // Starts from the saved order each time it opens.
  useEffect(() => {
    if (open && categoriesQuery.data) setOrder(categoriesQuery.data);
    if (!open) setOrder(null);
  }, [categoriesQuery.data, open]);

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => organizationApi.reorderItemCategories(ids),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Category order was not saved',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemCategoryQueries(queryClient);
      // The till's and kiosk's menus are ordered by it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.posMenu() });
      showToast({ title: 'Category order saved', variant: 'success' });
      onClose();
    },
  });

  const list = order ?? [];
  const changed =
    order !== null &&
    categoriesQuery.data !== undefined &&
    order.some((category, index) => categoriesQuery.data[index]?.id !== category.id);

  return (
    <Modal
      description="The order categories come in on restaurant menus, the till and the kiosk. Drag a category, or use the arrows."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!changed || saveMutation.isPending}
            onClick={() => saveMutation.mutate(list.map((category) => category.id))}
            type="button"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save order
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      side
      title="Arrange categories"
    >
      {categoriesQuery.isLoading || order === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton className="h-14 rounded-xl" key={key} />
          ))}
        </div>
      ) : categoriesQuery.isError ? (
        <p className="text-sm text-ds-status-bad-fg">{getApiErrorMessage(categoriesQuery.error)}</p>
      ) : (
        <ol aria-label="Category order" className="space-y-2">
          {list.map((category, index) => (
            <li
              className={cn(
                'flex items-center gap-3 rounded-xl border bg-ds-surface px-2.5 py-2 transition-[border-color,box-shadow,opacity] duration-150',
                dragging === index
                  ? 'border-ds-primary opacity-60 shadow-card-hover'
                  : 'border-ds-border',
              )}
              draggable
              key={category.id}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragging === null || dragging === index) return;
                setOrder((current) => (current ? move(current, dragging, index) : current));
                setDragging(index);
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDragging(index);
              }}
            >
              <GripVertical
                aria-hidden="true"
                className="h-4 w-4 shrink-0 cursor-grab text-ds-muted pointer-coarse:hidden"
              />
              <span className="w-6 shrink-0 text-right font-mono text-[12px] text-ds-muted tabular-nums">
                {index + 1}
              </span>
              <RecordAvatar name={category.categoryName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ds-text">
                  {category.categoryName}
                </span>
                {category.isActive ? null : (
                  <span className="text-[11.5px] text-ds-muted">Inactive</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                {[
                  { disabled: index === 0, icon: ChevronsUp, label: 'to the top', to: 0 },
                  { disabled: index === 0, icon: ArrowUp, label: 'up', to: index - 1 },
                  {
                    disabled: index === list.length - 1,
                    icon: ArrowDown,
                    label: 'down',
                    to: index + 1,
                  },
                ].map((action) => (
                  <button
                    aria-label={`Move ${category.categoryName} ${action.label}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary pointer-coarse:h-10 pointer-coarse:w-10"
                    disabled={action.disabled}
                    key={action.label}
                    onClick={() =>
                      setOrder((current) => (current ? move(current, index, action.to) : current))
                    }
                    type="button"
                  >
                    <action.icon aria-hidden="true" className="h-4 w-4" />
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
