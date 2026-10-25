'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChefHat, Loader2, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KitchenProduction } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { LoadError } from '@/components/location-empty-states';
import { glass } from '@/components/order-board/board-header';
import { useToast } from '@/components/toast-provider';
import { Input, Select, Skeleton } from '@/components/ui';
import { QuantityStepper } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import styles from './tablet.module.css';

const kitchenStorageKey = 'aahar.kitchen-tablet.kitchen';

/** A frosted card on the page's colour, as on the order board. */
const card = cn('rounded-[24px]', glass);

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
    <section className="relative isolate space-y-4">
      {/* Two soft pools of colour drift behind the glass, as on the order board. Each sits inside
          the page and fades out before its own edge, so the clip never shows as a line. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div
          className={`absolute top-0 left-0 h-130 w-[60%] rounded-full ${styles.driftA}`}
          style={{
            background: 'radial-gradient(closest-side, rgb(56 189 248 / 0.22), transparent)',
          }}
        />
        <div
          className={`absolute top-48 right-0 h-155 w-[60%] rounded-full ${styles.driftB}`}
          style={{
            background: 'radial-gradient(closest-side, rgb(167 139 250 / 0.2), transparent)',
          }}
        />
      </div>

      <header className={cn('flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5', card)}>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ds-muted">What did you make?</p>
          <h1 className="mt-0.5 text-[30px] leading-tight font-bold tracking-[-0.03em] text-ds-text sm:text-[36px]">
            {kitchen?.kitchenName ?? 'Kitchen tablet'}
          </h1>
          {kitchen ? (
            <p className="mt-1 text-[15px] font-medium text-ds-text-3">
              {[selectedLocation?.hospitalName, dayFormatter.format(now)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {kitchen && slot ? (
            <span
              className={cn(
                'flex h-11 items-center rounded-full px-4 text-[15px] font-semibold',
                glass,
              )}
            >
              {slot}
            </span>
          ) : null}
          <time className="text-[44px] leading-none font-light tracking-[-0.04em] text-ds-text tabular-nums">
            {timeFormatter.format(now)}
          </time>
        </div>
        {kitchen ? (
          <div className="flex w-full flex-wrap items-center gap-3">
            <Stat label="Made today" tone="ok" value={totalMade} />
            <Stat label="Wasted" tone={totalWasted ? 'pending' : 'neutral'} value={totalWasted} />
            <Stat label={log.length === 1 ? 'Post' : 'Posts'} tone="neutral" value={log.length} />
            {kitchens.length > 1 ? (
              <div className="w-full sm:ml-auto sm:w-64">
                <Select
                  aria-label="Kitchen"
                  className="h-14 text-base"
                  onChange={(event) => chooseKitchen(event.target.value)}
                  value={kitchen.id}
                >
                  {kitchens.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.kitchenName}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {kitchensQuery.isLoading ? (
        <Skeleton className="h-64 w-full rounded-[24px]" />
      ) : kitchensQuery.isError ? (
        <div className={cn('p-8', card)}>
          <LoadError error={kitchensQuery.error} />
        </div>
      ) : !kitchen ? (
        <div className={cn('p-2', card)}>
          <EmptyState
            description="Kitchens are set up under Organization → Kitchens."
            icon={ChefHat}
            title="No kitchen at this location"
          />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[15px] text-ds-text-3">
                Set the batch, then Post. It goes straight into kitchen stock.
              </p>
              {(itemsQuery.data?.length ?? 0) > 8 ? (
                <label className="relative block w-full sm:max-w-xs">
                  <span className="sr-only">Find an item</span>
                  <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ds-muted" />
                  <Input
                    className="h-14 rounded-full pl-11 text-base"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Find an item"
                    value={search}
                  />
                </label>
              ) : null}
            </div>
            {itemsQuery.isLoading ? (
              <Skeleton className="h-48 w-full rounded-[24px]" />
            ) : itemsQuery.isError ? (
              <div className={cn('p-8', card)}>
                <LoadError error={itemsQuery.error} />
              </div>
            ) : items.length === 0 ? (
              <div className={cn('p-2', card)}>
                <EmptyState
                  description="Map the items this kitchen makes under Item & Menu Setup → Item Mapping."
                  icon={ChefHat}
                  title={term ? 'No item matches' : 'Nothing is mapped to this kitchen'}
                />
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
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
                      {/* A batch being set turns the card blue: the cook sees what is unposted. */}
                      <div
                        className={cn(
                          'flex h-full flex-col gap-4 p-5 transition',
                          card,
                          made > 0 && 'bg-ds-primary-soft/80 ring-2 ring-ds-primary/50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-xl leading-snug font-bold tracking-[-0.01em] text-ds-text">
                              {item.itemName}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-ds-muted">
                              {item.itemCode}
                            </p>
                          </div>
                          <p className="shrink-0 text-right text-xs font-medium text-ds-muted">
                            Made today
                            <span className="mt-1 block text-[28px] leading-none font-bold text-ds-text tabular-nums">
                              {madeToday.get(item.id) ?? 0}
                            </span>
                          </p>
                        </div>
                        {/* Label and stepper share a row while they fit, and stack when not. */}
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[15px] font-semibold text-ds-text-2">Batch</span>
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
                              className="h-14 rounded-control-lg text-lg font-semibold tabular-nums"
                              disabled={made < 10}
                              onClick={() => nudge(-10)}
                              type="button"
                              variant="outline"
                            >
                              −10
                            </Button>
                            <Button
                              aria-label={`Ten more ${item.itemName}`}
                              className="h-14 rounded-control-lg text-lg font-semibold tabular-nums"
                              onClick={() => nudge(10)}
                              type="button"
                              variant="outline"
                            >
                              +10
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[15px] font-semibold text-ds-text-2">Wasted</span>
                          <QuantityStepper
                            label={`${item.itemName} wasted`}
                            max={made}
                            min={0}
                            onChange={(value) =>
                              setDraft(item.id, (current) => ({ ...current, waste: value }))
                            }
                            touch
                            value={draft.waste}
                          />
                        </div>
                        <Button
                          className="mt-auto h-16 rounded-control-lg text-lg font-semibold"
                          disabled={!canPost || made <= 0 || made === wasted || post.isPending}
                          onClick={() => post.mutate({ itemId: item.id, made, wasted })}
                          title={
                            canPost ? undefined : 'Needs permission to create and post production'
                          }
                          type="button"
                        >
                          {isPosting ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-6 w-6" />
                          )}
                          Post {made - wasted > 0 ? made - wasted : ''}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <section
            aria-label="Posted today"
            className={cn(
              'self-start p-5 xl:sticky xl:top-[calc(var(--app-header-h)+1.5rem)]',
              card,
            )}
          >
            <h2 className="flex items-baseline gap-2 text-lg font-bold text-ds-text">
              Posted today
              <span className="font-light text-ds-text-3 tabular-nums">{log.length}</span>
            </h2>
            <p className="text-sm text-ds-muted">
              <span className="font-semibold text-ds-text tabular-nums">{totalMade}</span> made ·{' '}
              <span className="tabular-nums">{totalWasted}</span> wasted
            </p>
            {log.length === 0 ? (
              <p className="mt-4 rounded-[18px] border border-dashed border-ds-border px-4 py-6 text-center text-[15px] text-ds-muted">
                Nothing posted yet today.
              </p>
            ) : (
              <ol className="mt-3 divide-y divide-ds-divider">
                {log.map(({ line, production }) => (
                  // Keyed by line, so only a newly posted line rises in.
                  <li className={cn('flex items-center gap-3 py-3', styles.rise)} key={line.id}>
                    <span className="w-12 shrink-0 text-sm font-medium text-ds-muted tabular-nums">
                      {timeFormatter.format(new Date(production.productionDate))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ds-text">
                        {line.item.itemName}
                      </span>
                      <span className="block text-xs text-ds-muted">
                        {production.productionNumber} ·{' '}
                        {line.wastageQty ? `${line.wastageQty} wasted` : 'none wasted'}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-ds-status-ok-bg px-3 py-1 text-base font-bold text-ds-status-ok-fg tabular-nums">
                      {line.acceptedQty}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

const statTones = {
  neutral: 'bg-ds-primary-soft text-ds-link',
  ok: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
} as const;

/** A count in the header, on a pastel tint. */
function Stat({
  label,
  tone,
  value,
}: Readonly<{ label: string; tone: keyof typeof statTones; value: number }>) {
  return (
    <p className={cn('flex items-baseline gap-2 rounded-2xl px-4 py-2', statTones[tone])}>
      <span className="text-[26px] leading-none font-bold tabular-nums">{value}</span>
      <span className="text-[13px] font-semibold">{label}</span>
    </p>
  );
}
