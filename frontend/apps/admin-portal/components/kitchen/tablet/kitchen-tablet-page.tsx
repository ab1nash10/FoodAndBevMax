'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChefHat, Loader2, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KitchenProduction } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, EmptyState } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { LoadError } from '@/components/location-empty-states';
import { useToast } from '@/components/toast-provider';
import { Input, Panel, Select, Skeleton } from '@/components/ui';
import { QuantityStepper } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const kitchenStorageKey = 'aahar.kitchen-tablet.kitchen';

/** Today in India as YYYY-MM-DD: the kitchen's business day. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const dayFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Kolkata',
  weekday: 'long',
});
const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

/** The clock on the board, moving each minute. */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}

const minuteOf = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);

  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/** The meal slot `now` falls in (a slot ending before it starts runs past midnight). */
function currentSlot(
  slots: Array<{ endTime: string | null; slotName: string; startTime: string | null }>,
  now: Date,
): string | null {
  const minute = minuteOf(timeFormatter.format(now));
  const slot = slots.find(({ endTime, startTime }) => {
    if (!startTime || !endTime) return false;
    const start = minuteOf(startTime);
    const end = minuteOf(endTime);

    return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
  });

  return slot?.slotName ?? null;
}

interface Draft {
  batch: string;
  waste: string;
}

const emptyDraft: Draft = { batch: '0', waste: '0' };

/**
 * The kitchen's touch board: for each item the kitchen makes, set how many came out of the batch
 * and how many were wasted, then Post. Each Post is one production, posted straight to kitchen
 * stock, and shows in today's list beside it.
 */
export function KitchenTabletPageClient() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId, selectedLocation } = useLocationContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const now = useClock();
  const today = todayInIndia();
  const [kitchenId, setKitchenId] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const canPost =
    hasPermission('KITCHEN_PRODUCTION_CREATE') && hasPermission('KITCHEN_PRODUCTION_POST');

  const kitchensQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listKitchens({
          hospitalId: scopedHospitalId,
          isActive: true,
          limit: 100,
          sortBy: 'kitchenName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.kitchenKitchens(scopedHospitalId ?? 'all'),
  });
  const kitchens = kitchensQuery.data ?? [];
  const kitchen = kitchens.find((entry) => entry.id === kitchenId) ?? kitchens[0] ?? null;

  useEffect(() => {
    try {
      setKitchenId(window.localStorage.getItem(kitchenStorageKey) ?? '');
    } catch {
      // Storage may be refused (private window); the first kitchen is used.
    }
  }, []);

  const chooseKitchen = useCallback((id: string) => {
    setKitchenId(id);
    setDrafts({});
    try {
      window.localStorage.setItem(kitchenStorageKey, id);
    } catch {
      // The choice then lasts for this visit only.
    }
  }, []);

  const itemsQuery = useQuery({
    enabled: Boolean(kitchen),
    queryFn: async () => {
      const mappings = (
        await organizationApi.listKitchenItems({
          isActive: true,
          kitchenId: kitchen!.id,
          limit: 100,
        })
      ).data.items;

      // An item mapped under several categories is still one thing the kitchen makes.
      return mappings
        .filter(
          (mapping, index) => mappings.findIndex((m) => m.itemId === mapping.itemId) === index,
        )
        .map((mapping) => mapping.item)
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
    },
    queryKey: queryKeys.kitchenProductionItems(kitchen?.id),
  });
  const todayQuery = useQuery({
    enabled: Boolean(kitchen),
    queryFn: async () =>
      (
        await organizationApi.listKitchenProductions({
          fromDate: today,
          kitchenId: kitchen!.id,
          limit: 100,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          status: 'POSTED',
          toDate: today,
        })
      ).data.items,
    queryKey: queryKeys.kitchenProductionsToday(kitchen?.id, today),
    refetchInterval: 60_000,
  });
  const slotsQuery = useQuery({
    enabled: Boolean(kitchen),
    queryFn: async () =>
      (
        await organizationApi.listTimeSlots({
          hospitalId: kitchen!.hospitalId,
          isActive: true,
          limit: 100,
        })
      ).data.items,
    queryKey: queryKeys.kitchenProductionItems('slots', kitchen?.hospitalId),
  });

  const posted = todayQuery.data ?? [];
  const madeToday = useMemo(() => {
    const made = new Map<string, number>();

    for (const production of posted) {
      for (const line of production.lines) {
        made.set(line.itemId, (made.get(line.itemId) ?? 0) + line.acceptedQty);
      }
    }

    return made;
  }, [posted]);
  const log = posted.flatMap((production: KitchenProduction) =>
    production.lines.map((line) => ({ line, production })),
  );
  const totalMade = log.reduce((sum, { line }) => sum + line.acceptedQty, 0);
  const totalWasted = log.reduce((sum, { line }) => sum + line.wastageQty, 0);
  const term = search.trim().toLowerCase();
  const items = (itemsQuery.data ?? []).filter(
    (item) =>
      !term ||
      item.itemName.toLowerCase().includes(term) ||
      item.itemCode.toLowerCase().includes(term),
  );
  const slot = currentSlot(slotsQuery.data ?? [], now);

  const draftOf = (itemId: string) => drafts[itemId] ?? emptyDraft;
  const setDraft = (itemId: string, change: (draft: Draft) => Draft) =>
    setDrafts((current) => ({ ...current, [itemId]: change(current[itemId] ?? emptyDraft) }));

  const post = useMutation({
    mutationFn: async ({
      itemId,
      made,
      wasted,
    }: {
      itemId: string;
      made: number;
      wasted: number;
    }) => {
      const production = (
        await organizationApi.createKitchenProduction({
          businessDate: today,
          hospitalId: kitchen!.hospitalId,
          items: [{ acceptedQty: made - wasted, itemId, producedQty: made, wastageQty: wasted }],
          kitchenId: kitchen!.id,
          productionDate: new Date().toISOString(),
        })
      ).data;

      return (await organizationApi.postKitchenProduction(production.id)).data;
    },
    onError: (error) =>
      showToast({ description: getApiErrorMessage(error), title: 'Not posted', variant: 'error' }),
    onSuccess: (production, { itemId }) => {
      const line = production.lines[0];
      invalidateKitchenProductionQueries(queryClient);
      setDrafts((current) => ({ ...current, [itemId]: emptyDraft }));
      showToast({
        description: `${line?.acceptedQty ?? 0} ${line?.item.itemName ?? ''} added to kitchen stock.`,
        title: `${production.productionNumber} posted`,
        variant: 'success',
      });
    },
  });

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          kitchens.length > 1 ? (
            <Select
              aria-label="Kitchen"
              className="h-11 min-w-56"
              onChange={(event) => chooseKitchen(event.target.value)}
              value={kitchen?.id ?? ''}
            >
              {kitchens.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.kitchenName}
                </option>
              ))}
            </Select>
          ) : null
        }
        description={
          kitchen
            ? `${selectedLocation?.hospitalName ?? ''}${selectedLocation ? ' · ' : ''}${dayFormatter.format(now)}${slot ? ` · ${slot}` : ''} · ${timeFormatter.format(now)}`
            : undefined
        }
        eyebrow="What did you make?"
        title={kitchen?.kitchenName ?? 'Kitchen tablet'}
      />

      {kitchensQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : kitchensQuery.isError ? (
        <Panel className="p-8">
          <LoadError error={kitchensQuery.error} />
        </Panel>
      ) : !kitchen ? (
        <Panel>
          <EmptyState
            description="Kitchens are set up under Organization → Kitchens."
            icon={ChefHat}
            title="No kitchen at this location"
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-ds-muted">
              Set the batch, then Post. It goes straight into kitchen stock.
            </p>
            {(itemsQuery.data?.length ?? 0) > 8 ? (
              <label className="relative block max-w-md">
                <span className="sr-only">Find an item</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ds-muted" />
                <Input
                  className="h-11 pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find an item"
                  value={search}
                />
              </label>
            ) : null}
            {itemsQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : itemsQuery.isError ? (
              <Panel className="p-8">
                <LoadError error={itemsQuery.error} />
              </Panel>
            ) : items.length === 0 ? (
              <Panel>
                <EmptyState
                  description="Map the items this kitchen makes under Item & Menu Setup → Item Mapping."
                  icon={ChefHat}
                  title={term ? 'No item matches' : 'Nothing is mapped to this kitchen'}
                />
              </Panel>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {items.map((item) => {
                  const draft = draftOf(item.id);
                  const made = Math.max(0, Number(draft.batch) || 0);
                  const wasted = Math.min(made, Math.max(0, Number(draft.waste) || 0));
                  const isPosting = post.isPending && post.variables?.itemId === item.id;
                  const nudge = (by: number) =>
                    setDraft(item.id, (current) => {
                      const batch = Math.max(0, (Number(current.batch) || 0) + by);

                      return {
                        batch: String(batch),
                        waste: String(Math.min(Number(current.waste) || 0, batch)),
                      };
                    });

                  return (
                    <li key={item.id}>
                      <Panel
                        className={cn(
                          'flex h-full flex-col gap-4 p-4 transition',
                          made > 0 && 'ring-2 ring-ds-primary/40',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold text-ds-text">
                              {item.itemName}
                            </p>
                            <p className="font-mono text-xs text-ds-muted">{item.itemCode}</p>
                          </div>
                          <p className="shrink-0 text-right text-xs text-ds-muted">
                            Made today
                            <span className="block font-mono text-lg font-semibold text-ds-text">
                              {madeToday.get(item.id) ?? 0}
                            </span>
                          </p>
                        </div>
                        {/* The stepper on its own row, ±10 under it: fits a narrow card. */}
                        <div className="space-y-2">
                          <div className="flex justify-center">
                            <QuantityStepper
                              label={`${item.itemName} made`}
                              touch
                              min={0}
                              onChange={(value) =>
                                setDraft(item.id, (current) => ({
                                  batch: value,
                                  waste: String(
                                    Math.min(Number(current.waste) || 0, Number(value) || 0),
                                  ),
                                }))
                              }
                              value={draft.batch}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              aria-label={`Ten fewer ${item.itemName}`}
                              className="h-12 font-mono text-base"
                              disabled={made < 10}
                              onClick={() => nudge(-10)}
                              type="button"
                              variant="outline"
                            >
                              −10
                            </Button>
                            <Button
                              aria-label={`Ten more ${item.itemName}`}
                              className="h-12 font-mono text-base"
                              onClick={() => nudge(10)}
                              type="button"
                              variant="outline"
                            >
                              +10
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-ds-text-2">Wasted</span>
                          <div className="w-40">
                            <QuantityStepper
                              compact
                              label={`${item.itemName} wasted`}
                              max={made}
                              min={0}
                              onChange={(value) =>
                                setDraft(item.id, (current) => ({ ...current, waste: value }))
                              }
                              value={draft.waste}
                            />
                          </div>
                        </div>
                        <Button
                          className="mt-auto h-14 text-base"
                          disabled={!canPost || made <= 0 || made === wasted || post.isPending}
                          onClick={() => post.mutate({ itemId: item.id, made, wasted })}
                          title={
                            canPost ? undefined : 'Needs permission to create and post production'
                          }
                          type="button"
                        >
                          {isPosting ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}
                          Post {made - wasted > 0 ? made - wasted : ''}
                        </Button>
                      </Panel>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Panel
            aria-label="Posted today"
            className="self-start p-4 xl:sticky xl:top-[calc(var(--app-header-h)+1.5rem)]"
            role="region"
          >
            <h2 className="text-base font-semibold text-ds-text">Posted today</h2>
            <p className="text-sm text-ds-muted">
              <span className="font-mono font-semibold text-ds-text">{totalMade}</span> made ·{' '}
              <span className="font-mono">{totalWasted}</span> wasted
            </p>
            {log.length === 0 ? (
              <p className="mt-4 text-sm text-ds-muted italic">Nothing posted yet today.</p>
            ) : (
              <ol className="mt-3 divide-y divide-ds-divider">
                {log.map(({ line, production }) => (
                  <li className="flex gap-3 py-2.5" key={line.id}>
                    <span className="w-12 shrink-0 font-mono text-sm text-ds-muted">
                      {timeFormatter.format(new Date(production.productionDate))}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ds-text">
                        {line.item.itemName} · {line.acceptedQty}
                      </span>
                      <span className="block text-xs text-ds-muted">
                        {production.productionNumber} ·{' '}
                        {line.wastageQty ? `${line.wastageQty} wasted` : 'none wasted'}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}
    </section>
  );
}
