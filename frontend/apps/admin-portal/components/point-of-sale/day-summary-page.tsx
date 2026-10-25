'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { ListOrdered, Printer } from 'lucide-react';
import Link from 'next/link';
import type { PaymentMode, PosDaySummary } from '@aahar/api-client';
import { AppPageHeader, StatStrip, tableStyles } from '@/components/design-system';
import {
  CounterPicker,
  NoCounter,
  formatDateTime,
  formatMoney,
  paymentModeLabels,
  todayInIndia,
  usePosCounter,
} from '@/components/point-of-sale/shared';
import { DayShiftsPanel } from '@/components/point-of-sale/day-shifts-panel';
import { Input, Panel } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { escapeHtml, printHtml } from '@/lib/print';
import { queryKeys } from '@/lib/query-keys';
import { RefreshButton } from '@/components/list-toolbar';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const paymentModes: PaymentMode[] = ['CARD', 'UPI', 'CASH', 'OTHER'];

function modeTotals(summary: PosDaySummary) {
  return paymentModes.map(
    (mode) =>
      summary.byPaymentMode.find((entry) => entry.mode === mode) ?? { amount: 0, count: 0, mode },
  );
}

/** The day's takings on an 80 mm slip, through a hidden frame so the screen stays put. */
function printSummary(summary: PosDaySummary) {
  const row = (left: string, count: number, amount: number) =>
    `<tr><td>${left}</td><td class="num">${count}</td><td class="num">${formatMoney(amount)}</td></tr>`;
  const body = `
<h1 class="title">${escapeHtml(summary.counter.restaurant.restaurantName)}</h1>
<p class="c" style="margin-top:2px">${escapeHtml(summary.counter.counterName)}<br><span class="b">Day summary · ${escapeHtml(summary.date)}</span></p>
<hr><table class="totals"><colgroup><col><col style="width:12mm"><col style="width:30mm"></colgroup>
${modeTotals(summary)
  .map((entry) => row(paymentModeLabels[entry.mode], entry.count, entry.amount))
  .join('')}
<tr class="grand"><td>Sales</td><td class="num">${summary.bills}</td><td class="num">${formatMoney(summary.sales)}</td></tr>
</table><hr><table class="totals"><colgroup><col><col style="width:12mm"><col style="width:30mm"></colgroup>
${row('Complimentary', summary.complimentary.count, summary.complimentary.amount)}
${row('Cancelled', summary.cancelled.count, summary.cancelled.amount)}
</table><hr>
<p class="fine">Printed ${formatDateTime(new Date().toISOString())}</p>`;

  printHtml(`Day summary ${summary.date}`, body);
}

/** One counter's takings for a business day: what the till hands over at close. */
export function DaySummaryPageClient() {
  const { counter, counters, query: countersQuery, setCounterId } = usePosCounter();
  const today = todayInIndia();
  const [date, setDate] = useUrlParam('date', today);
  const summaryQuery = useQuery({
    enabled: Boolean(counter),
    queryFn: async () => (await organizationApi.getPosDaySummary(counter!.id, date)).data,
    queryKey: queryKeys.posSummary(counter?.id, date),
  });
  const summary = summaryQuery.data;
  const totals = summary ? modeTotals(summary) : null;

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <>
            <CounterPicker counter={counter} counters={counters} onChange={setCounterId} />
            <Input
              aria-label="Business date"
              className="h-10 w-auto"
              max={today}
              onChange={(event) => setDate(event.target.value || today)}
              type="date"
              value={date}
            />
            <RefreshButton onClick={() => void summaryQuery.refetch()} />
          </>
        }
        description="A counter's takings for the day by payment mode, with complimentary and cancelled bills kept out of sales."
        title="Day Summary"
      />
      {!counter ? (
        <NoCounter isLoading={countersQuery.isLoading} />
      ) : summaryQuery.isError ? (
        <Panel className="p-6 text-sm text-ds-status-bad-fg">
          {getApiErrorMessage(summaryQuery.error)}
        </Panel>
      ) : (
        <>
          <StatStrip
            label="The day at a glance"
            stats={[
              {
                label: 'Sales',
                tone: 'ok',
                value: summary ? formatMoney(summary.sales) : '–',
              },
              { label: 'Paid bills', value: summary?.bills ?? '–' },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="overflow-hidden">
              <h2 className="border-b border-ds-divider px-4 py-3 text-sm font-semibold text-ds-text">
                By payment mode
              </h2>
              <table className={tableStyles.table}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={tableStyles.th}>Mode</th>
                    <th className={cn(tableStyles.th, 'text-right')}>Bills</th>
                    <th className={cn(tableStyles.th, 'text-right')}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentModes.map((mode, index) => {
                    const entry = totals?.[index];

                    return (
                      <tr className="border-t border-ds-divider" key={mode}>
                        <td className={cn(tableStyles.td, tableStyles.title)}>
                          {paymentModeLabels[mode]}
                        </td>
                        <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                          {entry?.count ?? '–'}
                        </td>
                        <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                          {entry ? formatMoney(entry.amount) : '–'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-ds-border bg-ds-subtle font-semibold text-ds-text">
                    <td className={tableStyles.td}>Sales</td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                      {summary?.bills ?? '–'}
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                      {summary ? formatMoney(summary.sales) : '–'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>
            <Panel className="overflow-hidden">
              <h2 className="border-b border-ds-divider px-4 py-3 text-sm font-semibold text-ds-text">
                Not in sales
              </h2>
              <table className={tableStyles.table}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={tableStyles.th}>Bills</th>
                    <th className={cn(tableStyles.th, 'text-right')}>Count</th>
                    <th className={cn(tableStyles.th, 'text-right')}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Complimentary', summary?.complimentary],
                      ['Cancelled', summary?.cancelled],
                    ] as const
                  ).map(([label, entry]) => (
                    <tr className="border-t border-ds-divider" key={label}>
                      <td className={cn(tableStyles.td, tableStyles.title)}>{label}</td>
                      <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                        {entry?.count ?? '–'}
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                        {entry ? formatMoney(entry.amount) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
          {summary ? <DayShiftsPanel counterId={counter.id} date={date} summary={summary} /> : null}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!summary}
              onClick={() => summary && printSummary(summary)}
              type="button"
            >
              <Printer className="h-4 w-4" />
              Print summary
            </Button>
            <Button asChild variant="outline">
              <Link href={`/pos/history?counter=${counter.id}&from=${date}&to=${date}`}>
                <ListOrdered className="h-4 w-4" />
                View bills
              </Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
