'use client';

// Usage: <CountersRow /> under the KPI row. Shown to roles that may view POS bills, at a location
// with counters. Requests: one day summary per counter, nothing else. The counter list is the
// active-counters query the dashboard already holds (location names read it); only a role that
// cannot list counters fetches /pos/counters instead. Takings come per counter and day (the API
// has no cross-counter or per-day total), so there is no trend line: seven per-day counts for one
// sparkline cost 7 requests a load (measured on the production preview, 2026-10-23).

import type { PaymentMode } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { Gift, IndianRupee, Receipt, ShoppingBag } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { useAuth } from '@/components/auth-provider';
import { useAllCounters } from '@/components/inventory/use-locations';
import { useLocationContext } from '@/components/location-context';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { todayInIndia } from '@/lib/today-in-india';

const money = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 0,
  style: 'currency',
});

const modeLabels: Record<PaymentMode, string> = {
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
  UPI: 'UPI',
};

export function CountersRow() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const canView = hasPermission('POS_ORDER_VIEW');
  const canListCounters = hasPermission('COUNTER_VIEW');
  const today = todayInIndia();

  // The dashboard's own active-counters query when the role may list counters (no new request);
  // otherwise the counters this user may bill at.
  const allCounters = useAllCounters(canView && canListCounters);
  const posCounters = useQuery({
    enabled: canView && !canListCounters,
    queryFn: async () => (await organizationApi.listPosCounters()).data,
    queryKey: queryKeys.posCounters(),
  });
  const countersQuery = canListCounters ? allCounters : posCounters;
  const counterIds = (countersQuery.data ?? [])
    .filter((counter) => !scopedHospitalId || counter.hospitalId === scopedHospitalId)
    .map((counter) => counter.id);

  const todayQuery = useQuery({
    enabled: canView && counterIds.length > 0,
    queryFn: async () => {
      const summaries = await Promise.all(
        counterIds.map(async (id) => (await organizationApi.getPosDaySummary(id, today)).data),
      );
      const byMode = new Map<PaymentMode, number>();

      for (const summary of summaries) {
        for (const { amount, mode } of summary.byPaymentMode) {
          byMode.set(mode, (byMode.get(mode) ?? 0) + amount);
        }
      }

      return {
        bills: summaries.reduce((sum, summary) => sum + summary.bills, 0),
        complimentary: summaries.reduce((sum, summary) => sum + summary.complimentary.count, 0),
        complimentaryAmount: summaries.reduce(
          (sum, summary) => sum + summary.complimentary.amount,
          0,
        ),
        // The two ways most of today's money came in, largest first.
        topModes: [...byMode]
          .filter(([, amount]) => amount > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2),
        sales: summaries.reduce((sum, summary) => sum + summary.sales, 0),
      };
    },
    queryKey: queryKeys.posSummary('dashboard', today, ...counterIds),
    refetchInterval: 60_000,
  });

  // Nothing to say at a location without counters, or to a role that cannot see bills.
  if (!canView || (countersQuery.isSuccess && counterIds.length === 0)) {
    return null;
  }

  const totals = todayQuery.data;
  const loading = countersQuery.isLoading || todayQuery.isLoading;
  const error = countersQuery.isError || todayQuery.isError;
  const average = totals && totals.bills > 0 ? totals.sales / totals.bills : null;
  const counterCount = `${counterIds.length} counter${counterIds.length === 1 ? '' : 's'}`;

  return (
    <section aria-label="Today at the counters">
      <h2 className="mb-2.5 text-[13px] font-semibold text-ds-text-3">Today at the counters</h2>
      <div className="flex flex-wrap gap-3.5 *:min-w-0 *:grow *:basis-full sm:*:basis-[calc(50%-7px)] xl:*:basis-0">
        <KpiCard
          error={error}
          foot={
            totals?.topModes.length
              ? totals.topModes
                  .map(([mode, amount]) => `${modeLabels[mode]} ${money.format(amount)}`)
                  .join(' · ')
              : 'No payments yet today'
          }
          href="/pos/day"
          icon={IndianRupee}
          label="Sales"
          loading={loading}
          scope="Today"
          value={totals ? money.format(totals.sales) : '—'}
        />
        <KpiCard
          error={error}
          foot={`Across ${counterCount}`}
          href="/pos/history"
          icon={Receipt}
          label="Bills"
          loading={loading}
          scope="Today"
          value={totals ? String(totals.bills) : '—'}
        />
        <KpiCard
          error={error}
          foot={average === null ? 'No bills yet today' : 'Sales per bill'}
          href="/pos/history"
          icon={ShoppingBag}
          label="Average bill"
          loading={loading}
          scope="Today"
          value={average === null ? '—' : money.format(average)}
        />
        <KpiCard
          error={error}
          foot={
            totals?.complimentary
              ? `${money.format(totals.complimentaryAmount)} given`
              : 'None given today'
          }
          href="/pos/complimentary"
          icon={Gift}
          label="Complimentary"
          loading={loading}
          scope="Today"
          value={totals ? String(totals.complimentary) : '—'}
        />
      </div>
    </section>
  );
}
