'use client';

import type { ShiftMode, ShiftTiming } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Input, Label, Skeleton } from '@/components/ui';
import { Modal, SegmentedControl } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const defaultTimings: ShiftTiming[] = [
  { endTime: '15:00', name: 'Morning', startTime: '07:00' },
  { endTime: '23:00', name: 'Evening', startTime: '15:00' },
];

/** Why the timings cannot be saved yet; null when they can. */
function timingsProblem(mode: ShiftMode, timings: ShiftTiming[]): string | null {
  if (mode === 'CASHIER') return null;
  if (timings.length === 0) return 'Add at least one shift.';
  if (timings.some((timing) => !timing.name.trim())) return 'Give every shift a name.';
  if (timings.some((timing) => !timing.startTime || !timing.endTime)) {
    return 'Give every shift a start and an end time.';
  }
  if (timings.some((timing) => timing.startTime === timing.endTime)) {
    return 'A shift must end at a different time from when it starts.';
  }

  return null;
}

/**
 * How a restaurant's counters run shifts: each cashier opens and closes their own (the
 * default), or fixed shift times, a shift then being named after the one it opens in. Either
 * way the cashier opens a shift before billing and ends it by closing or handing over.
 */
export function ShiftSettingsPanel({
  onClose,
  restaurant,
}: Readonly<{
  onClose: () => void;
  /** The restaurant being set; null keeps the panel closed. */
  restaurant: { id: string; restaurantName: string } | null;
}>) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('RESTAURANT_UPDATE');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [mode, setMode] = useState<ShiftMode>('CASHIER');
  const [timings, setTimings] = useState<ShiftTiming[]>([]);
  const [submitted, setSubmitted] = useState(false);

  // Its own copy: refetching the restaurant's detail would reset an open edit form.
  const settingsQuery = useQuery({
    enabled: Boolean(restaurant),
    queryFn: async () => (await organizationApi.getRestaurant(restaurant!.id)).data,
    queryKey: queryKeys.restaurant('shift-settings', restaurant?.id),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setMode(settingsQuery.data.shiftMode);
    setTimings(settingsQuery.data.shiftTimings);
    setSubmitted(false);
  }, [settingsQuery.data]);

  const problem = timingsProblem(mode, timings);
  const saveMutation = useMutation({
    mutationFn: () =>
      organizationApi.updateRestaurant(restaurant!.id, {
        shiftMode: mode,
        shiftTimings: mode === 'FIXED' ? timings.map((t) => ({ ...t, name: t.name.trim() })) : [],
      }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Shift settings were not saved',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurant('shift-settings') });
      showToast({
        title: `Shift settings saved for ${restaurant?.restaurantName ?? 'the restaurant'}`,
        variant: 'success',
      });
      onClose();
    },
  });
  const setTiming = (index: number, patch: Partial<ShiftTiming>) =>
    setTimings((current) =>
      current.map((timing, at) => (at === index ? { ...timing, ...patch } : timing)),
    );

  return (
    <Modal
      description={restaurant?.restaurantName}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit ? (
            <Button
              disabled={saveMutation.isPending || !settingsQuery.data}
              onClick={() => {
                setSubmitted(true);
                if (!problem) saveMutation.mutate();
              }}
              type="button"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open={restaurant !== null}
      side
      title="Shifts"
    >
      {settingsQuery.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-control" />
          <Skeleton className="h-32" />
        </div>
      ) : settingsQuery.isError ? (
        <p className="text-sm font-medium text-ds-status-bad-fg">
          {getApiErrorMessage(settingsQuery.error)}
        </p>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>How shifts work here</Label>
            <SegmentedControl<ShiftMode>
              label="Shift mode"
              onChange={(value) => {
                if (!canEdit) return;
                setMode(value);
                if (value === 'FIXED' && timings.length === 0) setTimings(defaultTimings);
              }}
              options={[
                { label: 'Cashier opens and closes', value: 'CASHIER' },
                { label: 'Fixed shift times', value: 'FIXED' },
              ]}
              value={mode}
            />
            <p className="text-sm text-ds-muted">
              {mode === 'CASHIER'
                ? 'Each cashier opens a shift when they start and ends it when they stop.'
                : 'Cashiers still open and end their shifts; each one is named after the shift it opens in.'}
            </p>
          </div>
          {mode === 'FIXED' ? (
            <div className="grid gap-3">
              {timings.map((timing, index) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-ds-border p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                  key={index}
                >
                  <div className="col-span-2 grid gap-1 sm:col-span-1">
                    <Label htmlFor={`shift-name-${index}`}>Name</Label>
                    <Input
                      disabled={!canEdit}
                      id={`shift-name-${index}`}
                      maxLength={40}
                      onChange={(event) => setTiming(index, { name: event.target.value })}
                      placeholder="e.g. Morning"
                      value={timing.name}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`shift-from-${index}`}>From</Label>
                    <Input
                      disabled={!canEdit}
                      id={`shift-from-${index}`}
                      onChange={(event) => setTiming(index, { startTime: event.target.value })}
                      type="time"
                      value={timing.startTime}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`shift-to-${index}`}>To</Label>
                    <Input
                      disabled={!canEdit}
                      id={`shift-to-${index}`}
                      onChange={(event) => setTiming(index, { endTime: event.target.value })}
                      type="time"
                      value={timing.endTime}
                    />
                  </div>
                  {canEdit ? (
                    <Button
                      aria-label={`Remove ${timing.name || 'shift'}`}
                      className="col-start-2 row-start-2 self-end sm:col-start-auto sm:row-start-auto"
                      onClick={() =>
                        setTimings((current) => current.filter((_, at) => at !== index))
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {canEdit && timings.length < 6 ? (
                <Button
                  className="justify-self-start"
                  onClick={() =>
                    setTimings((current) => [...current, { endTime: '', name: '', startTime: '' }])
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  Add shift
                </Button>
              ) : null}
              <p className="text-xs text-ds-muted">
                A shift ending before it starts runs past midnight (e.g. Night 23:00 – 07:00).
              </p>
            </div>
          ) : null}
          {submitted && problem ? (
            <p className="text-sm font-medium text-ds-status-bad-fg" role="alert">
              {problem}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
