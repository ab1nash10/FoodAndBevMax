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
import { Input, Panel } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[char]!,
  );
}

/** The day's takings on an 80 mm slip, through a hidden frame so the screen stays put. */
function printSummary(summary: PosDaySummary) {
  const row = (left: string, count: number, amount: number) =>
    `<tr><td>${left}</td><td class="r">${count}</td><td class="r">${formatMoney(amount)}</td></tr>`;
  const body = `
<h1>${escapeHtml(summary.counter.restaurant.restaurantName)}</h1>
<p class="c">${escapeHtml(summary.counter.counterName)}<br>Day summary · ${escapeHtml(summary.date)}</p>
<hr><table>
${modeTotals(summary)
  .map((entry) => row(paymentModeLabels[entry.mode], entry.count, entry.amount))
  .join('')}
<tr class="big"><td>Sales</td><td class="r">${summary.bills}</td><td class="r">${formatMoney(summary.sales)}</td></tr>
</table><hr><table>
${row('Complimentary', summary.complimentary.count, summary.complimentary.amount)}
${row('Cancelled', summary.cancelled.count, summary.cancelled.amount)}
</table><hr>
<p class="c">Printed ${formatDateTime(new Date().toISOString())}</p>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;

  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Day summary ${escapeHtml(summary.date)}</title>
<style>
@page { size: 80mm auto; margin: 3mm; }
body { font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #000; margin: 0; width: 74mm; }
h1 { font-size: 14px; margin: 0; text-align: center; }
.c { text-align: center; } .r { text-align: right; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; }
.big { font-size: 14px; font-weight: 700; }
</style></head><body>${body}</body></html>`);
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  window.setTimeout(() => frame.remove(), 60_000);
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
