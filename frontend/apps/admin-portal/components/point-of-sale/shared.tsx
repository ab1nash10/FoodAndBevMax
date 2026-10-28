'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2, Printer, Receipt } from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, type PaymentMode, type PosBill, type PosCounter } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { TILL_KEY_STORAGE_KEY } from '@/lib/auth-storage';
import { StatusChip } from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Select, Skeleton } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { escapeHtml, printHtml } from '@/lib/print';
import { invalidatePosBillQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

export const paymentModeLabels: Record<PaymentMode, string> = {
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
  UPI: 'UPI',
};

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

export function formatMoney(value: number | null | undefined): string {
  return moneyFormatter.format(value ?? 0);
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

/** Today in India as YYYY-MM-DD: the POS business day. */
export { todayInIndia } from '@/lib/today-in-india';

const counterStorageKey = 'aahar.pos.counter';

function readStoredCounter(): string {
  try {
    return window.localStorage.getItem(counterStorageKey) ?? '';
  } catch {
    return '';
  }
}

/** The key this browser holds when an admin set it up as a till; null anywhere else. */
export function readTillKey(): string | null {
  try {
    return window.localStorage.getItem(TILL_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Keeps the key the server gave when an admin set this browser up as a till. */
export function saveTillKey(tillKey: string): void {
  try {
    window.localStorage.setItem(TILL_KEY_STORAGE_KEY, tillKey);
  } catch {
    // Private windows may refuse storage; the till then lasts for this visit only.
  }
}

/**
 * The till this browser is, as the server knows it from the key it holds. Asked once a session;
 * the POS module opens only where it names a till the user may work.
 */
export function usePosTill() {
  return useQuery({
    queryFn: async () => (await organizationApi.posWhoAmI(readTillKey())).data,
    queryKey: queryKeys.posWhoAmI(),
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * The counters of this computer's till, and the one the cashier works at: the till's device's
 * own counters, else its restaurants'. The choice among several is remembered here.
 */
export function usePosCounter() {
  const query = useQuery({
    queryFn: async () => (await organizationApi.listPosCounters(readTillKey())).data,
    queryKey: queryKeys.posCounters('till'),
    // A computer that is no till is an answer, not a hiccup: say so at once.
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status === 404) && count < 2,
  });
  const counters = query.data ?? [];
  const [storedId, setStoredId] = useState('');

  useEffect(() => {
    setStoredId(readStoredCounter());
  }, []);

  const counter = counters.find((entry) => entry.id === storedId) ?? counters[0] ?? null;
  const setCounterId = useCallback((id: string) => {
    setStoredId(id);
    try {
      window.localStorage.setItem(counterStorageKey, id);
    } catch {
      // Private windows may refuse storage; the choice then lasts for this visit only.
    }
  }, []);

  return { counter, counters, query, setCounterId };
}

export function counterLabel(counter: Pick<PosCounter, 'counterName' | 'restaurant'>): string {
  return `${counter.restaurant.restaurantName} · ${counter.counterName}`;
}

export function CounterPicker({
  counter,
  counters,
  onChange,
}: Readonly<{
  counter: PosCounter | null;
  counters: PosCounter[];
  onChange: (id: string) => void;
}>) {
  if (counters.length <= 1) {
    return counter ? (
      <span className="inline-flex h-10 items-center rounded-control-lg border border-ds-border bg-ds-subtle px-3 text-sm font-semibold text-ds-text">
        {counterLabel(counter)}
      </span>
    ) : null;
  }

  return (
    <Select
      aria-label="Counter"
      className="h-10 min-w-56"
      onChange={(event) => onChange(event.target.value)}
      value={counter?.id ?? ''}
    >
      {counters.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {counterLabel(entry)}
        </option>
      ))}
    </Select>
  );
}

/** What the till shows while it has no counter: still loading, or none set up for the user. */
export function NoCounter({ isLoading }: Readonly<{ isLoading: boolean }>) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="rounded-card border border-dashed border-ds-border bg-ds-surface p-10 text-center">
      <Receipt className="mx-auto h-8 w-8 text-ds-muted" />
      <p className="mt-3 font-semibold text-ds-text">No counter to bill at</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ds-muted">
        Counters are set up under POS &amp; Payment Machines → Counters. Ask an admin to add one for
        this location, or pick another location in the header.
      </p>
    </div>
  );
}

function billIssuer(bill: PosBill) {
  const entity = bill.restaurant.legalEntity;

  return {
    address: bill.restaurant.gstAddress ?? entity?.entityAddress ?? bill.restaurant.address,
    gstNumber: bill.restaurant.gstNumber ?? entity?.gstNumber ?? null,
    name: bill.restaurant.legalName ?? entity?.entityName ?? bill.restaurant.restaurantName,
  };
}

function row(left: string, right: string, className = '') {
  return `<tr class="${className}"><td>${escapeHtml(left)}</td><td class="num">${escapeHtml(right)}</td></tr>`;
}

const siteTime = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
const siteDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
});

/** A rupee amount without the sign, for the narrow item columns. */
const amount = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** Label | value rows under the invoice heading, skipping the empty ones. */
function facts(entries: Array<[string, string | null | undefined]>): string {
  const rows = entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `<tr><td>${escapeHtml(label)}:</td><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `<table class="facts">${rows}</table>`;
}

/** GST by rate, as CGST and SGST halves (every line's GST is an even number of paise). */
function gstByRate(bill: PosBill): Array<{ amount: number; rate: number }> {
  const rates = new Map<number, number>();

  for (const line of bill.lines) {
    if (line.gstAmount)
      rates.set(line.gstPercent, (rates.get(line.gstPercent) ?? 0) + line.gstAmount);
  }

  return [...rates].sort(([a], [b]) => a - b).map(([rate, amount]) => ({ amount, rate }));
}

/**
 * A UPI payment link for `amount` to the restaurant's UPI ID: scanned as a QR, any UPI app opens
 * with the payee, the amount and the invoice number filled in.
 */
export function upiPayLink({
  amount: value,
  payee,
  reference,
  upiId,
}: Readonly<{ amount: number; payee: string; reference?: string; upiId: string }>): string {
  const params = [
    ['pa', upiId],
    ['pn', payee],
    ['am', value.toFixed(2)],
    ['cu', 'INR'],
    ...(reference
      ? [
          ['tr', reference],
          ['tn', `Bill ${reference}`],
        ]
      : []),
  ];

  return `upi://pay?${params.map(([key, part]) => `${key}=${encodeURIComponent(part!)}`).join('&')}`;
}

/** The QR for a UPI payment link, as an image the till shows and the bill prints. */
export function UpiQr({ link, size = 160 }: Readonly<{ link: string; size?: number }>) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void QRCode.toDataURL(link, { margin: 1, width: size * 2 }).then((url) => {
      if (current) setSrc(url);
    });

    return () => {
      current = false;
    };
  }, [link, size]);

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data URL made on the page
    <img
      alt="UPI payment QR"
      className="rounded-control bg-white p-1"
      height={size}
      src={src}
      width={size}
    />
  ) : (
    <Skeleton style={{ height: size, width: size }} />
  );
}

/**
 * The customer's tax invoice, laid out as the previous POS printed it: a UPI QR to pay by,
 * issuer, invoice and order numbers, items with HSN/SAC (marked * when staff discount does not
 * apply to them), staff discount, then CGST and SGST by rate. A reprint says "Duplicate Bill".
 */
export async function printBill(
  bill: PosBill,
  { duplicate = false }: { duplicate?: boolean } = {},
) {
  const issuer = billIssuer(bill);
  const placed = new Date(bill.placedAt);
  const upiId = bill.restaurant.upiId?.trim();
  const qr =
    upiId && !bill.isComplimentary && bill.grandTotal > 0
      ? await QRCode.toDataURL(
          upiPayLink({
            amount: bill.grandTotal,
            payee: issuer.name,
            reference: bill.billNumber,
            upiId,
          }),
          { margin: 1, width: 360 },
        )
      : null;
  // Rate and price before staff discount, so the lines add up to the subtotal.
  const lines = bill.lines
    .map((line, index) => {
      const listPrice = line.taxableAmount + line.discountAmount;

      return `<tr><td>${index + 1}.</td><td><span class="name">${escapeHtml(line.itemName)}${line.isDiscountable ? '' : '*'}</span> x ${line.quantity}${line.note ? `<small>${escapeHtml(line.note)}</small>` : ''}</td><td>${escapeHtml(line.hsnCode ?? '')}</td><td class="num">${amount(listPrice / line.quantity)}</td><td class="num">${amount(listPrice)}</td></tr>`;
    })
    .join('');
  const taxes = gstByRate(bill)
    .map(
      ({ amount, rate }) =>
        `${row(`CGST (${rate / 2}%)`, formatMoney(amount / 2), 'tax')}${row(`SGST (${rate / 2}%)`, formatMoney(amount / 2), 'tax')}`,
    )
    .join('');
  const separator = '<tr class="sep"><td colspan="2"></td></tr>';
  const rates = gstByRate(bill).map(({ rate }) => `${rate}%`);
  const payment = bill.isComplimentary
    ? null
    : bill.paymentMode
      ? paymentModeLabels[bill.paymentMode]
      : null;
  const body = `
${qr ? `<div class="qr"><img alt="" src="${qr}"><small>Scan to pay by UPI</small></div>` : ''}
${duplicate ? '<p class="c" style="margin-bottom:5px"><span class="tag">Duplicate Bill</span></p>' : ''}
<h1 class="title">${bill.isComplimentary ? 'COMPLIMENTARY BILL' : 'TAX INVOICE'}</h1>
${bill.status === 'CANCELLED' ? '<p class="c" style="margin-top:4px"><span class="tag">*** CANCELLED ***</span></p>' : ''}
<p class="issuer">${escapeHtml(issuer.name)}${issuer.address ? `, ${escapeHtml(issuer.address)}` : ''}
${issuer.gstNumber ? `<br><span class="b">GSTIN: ${escapeHtml(issuer.gstNumber)}</span>` : ''}${bill.restaurant.fssaiNumber ? `<br>FSSAI License: ${escapeHtml(bill.restaurant.fssaiNumber)}` : ''}
<span class="brand">${escapeHtml(bill.restaurant.restaurantName)}</span></p>
<hr>
<p class="ids">Invoice #${escapeHtml(bill.billNumber)}<br>Order #${escapeHtml(bill.orderNumber)}</p>
${facts([
  ['Time', siteTime.format(placed).toUpperCase()],
  ['Date', siteDate.format(placed)],
  ['UID', bill.cashierCode],
  ['POS', bill.counter.counterName],
  ['KOT No', bill.kotNumber],
  [
    'Room',
    bill.roomNumber
      ? `${bill.roomNumber}${bill.bedNumber ? ` / Bed ${bill.bedNumber}` : ''}`
      : null,
  ],
  ['Mode of Payment', payment],
  ['Txn Id', bill.isComplimentary ? null : bill.paymentReference],
  ['Complimentary', bill.isComplimentary ? (bill.complimentaryReason ?? '-') : null],
  ['Place of Supply', bill.hospital.state],
])}
<hr>
<table class="items"><colgroup><col style="width:8%"><col style="width:38%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup><thead><tr><th>SN</th><th>ITEM x QTY</th><th>HSN/ SAC</th><th class="num">RATE</th><th class="num">PRICE</th></tr></thead><tbody>${lines}</tbody></table>
<hr>
<table class="totals">
${row('SUBTOTAL', formatMoney(bill.subtotal), 'b')}
${bill.discountTotal ? `${row(`Staff discount (${bill.discountPercent ?? 0}%)`, `-${formatMoney(bill.discountTotal)}`)}${row('Taxable value', formatMoney(bill.subtotal - bill.discountTotal))}` : ''}
${taxes ? `${separator}${taxes}` : ''}
${rates.length ? row(`GST TOTAL (${rates.join(' + ')})`, formatMoney(bill.gstTotal), 'b') : ''}
${bill.roundOff ? row('Round off', formatMoney(bill.roundOff)) : ''}
${row('GRAND TOTAL', formatMoney(bill.grandTotal), 'grand')}
</table>
${bill.channel === 'COUNTER' && bill.status !== 'CANCELLED' ? `<div class="order-no" style="margin-top:8px"><span>Watch the board for</span><strong>${escapeHtml(bill.orderNumber)}</strong></div>` : ''}
<p class="footer">Thanks &amp; Visit Again<br>Please mail us for feedback</p>
<p class="fine">This invoice is system-generated and does not require any signature, and food items marked with "*" are not eligible for discounts.</p>`;

  printHtml(bill.billNumber, body);
}

/** The order slip: the customer's order number for pickup, and what the kitchen makes. */
export function printKot(bill: PosBill) {
  const placed = new Date(bill.placedAt);
  const lines = bill.lines
    .map(
      (line) =>
        `<div class="kot-line"><span class="qty">${line.quantity} x</span><span>${escapeHtml(line.itemName)}${line.note ? `<span class="note">— ${escapeHtml(line.note)}</span>` : ''}</span></div>`,
    )
    .join('');
  const body = `
<p class="c b">POS: ${escapeHtml(bill.counter.counterName)}</p>
<div class="order-no"><span>Your Order No. is</span><strong>${escapeHtml(bill.orderNumber)}</strong></div>
${bill.roomNumber ? `<p class="service">ROOM ${escapeHtml(bill.roomNumber)}${bill.bedNumber ? ` / BED ${escapeHtml(bill.bedNumber)}` : ''}</p>` : ''}
${facts([
  ['Time', siteTime.format(placed).toUpperCase()],
  ['Date', siteDate.format(placed)],
  ['KOT No', bill.kotNumber],
  ['Bill No', bill.billNumber],
  ['Operator ID', bill.cashierCode],
])}
<hr>${lines}
${bill.instructions ? `<p class="kot-note">Note: ${escapeHtml(bill.instructions)}</p>` : ''}`;

  printHtml(`Order ${bill.orderNumber}`, body);
}

export function BillSummary({ bill }: Readonly<{ bill: PosBill }>) {
  const facts: Array<[string, string | null]> = [
    ['Bill', bill.billNumber],
    ['Placed', formatDateTime(bill.placedAt)],
    ['Counter', `${bill.restaurant.restaurantName} · ${bill.counter.counterName}`],
    ['Channel', bill.channel === 'ROOM' ? 'Room' : 'Counter'],
    [
      'Room',
      bill.roomNumber
        ? `${bill.roomNumber}${bill.bedNumber ? ` / Bed ${bill.bedNumber}` : ''}`
        : null,
    ],
    ['Customer mobile', bill.customerMobile],
    ['Employee ID', bill.employeeCode],
    [
      'Cashier',
      bill.cashierName
        ? `${bill.cashierName}${bill.cashierCode ? ` (${bill.cashierCode})` : ''}`
        : null,
    ],
    ['KOT no', bill.kotNumber],
    [
      'Payment',
      bill.isComplimentary
        ? 'Complimentary'
        : `${bill.paymentMode ? paymentModeLabels[bill.paymentMode] : '-'}${bill.paymentReference ? ` · ${bill.paymentReference}` : ''}`,
    ],
    ['Complimentary reason', bill.complimentaryReason],
    ['Instructions', bill.instructions],
    [
      'Cancelled',
      bill.cancelledAt ? `${formatDateTime(bill.cancelledAt)} · ${bill.cancelReason ?? ''}` : null,
    ],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={bill.status} />
        {bill.isComplimentary ? (
          <span className="rounded-full bg-ds-status-info-bg px-2.5 py-0.5 text-xs font-semibold text-ds-status-info-fg">
            Complimentary
          </span>
        ) : null}
        <span className="ml-auto font-mono text-sm text-ds-muted">Order {bill.orderNumber}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-ds-muted">{label}</dt>
              <dd className="mt-0.5 wrap-break-word text-sm font-medium text-ds-text">{value}</dd>
            </div>
          ))}
      </dl>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ds-divider text-left text-xs text-ds-muted">
            <th className="py-2 font-semibold">Item</th>
            <th className="py-2 text-right font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Rate</th>
            <th className="py-2 text-right font-semibold">GST</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((line) => (
            <tr className="border-b border-ds-divider" key={line.id}>
              <td className="py-2 text-ds-text">
                {line.itemName}
                {line.note ? <p className="text-xs text-ds-muted">{line.note}</p> : null}
              </td>
              <td className="py-2 text-right font-mono">{line.quantity}</td>
              <td className="py-2 text-right font-mono">{formatMoney(line.unitPrice)}</td>
              <td className="py-2 text-right font-mono text-ds-muted">{line.gstPercent}%</td>
              <td className="py-2 text-right font-mono">{formatMoney(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <BillTotals
        discountPercent={bill.discountPercent}
        discountTotal={bill.discountTotal}
        grandTotal={bill.grandTotal}
        gstRates={gstByRate(bill).map(({ rate }) => rate)}
        gstTotal={bill.gstTotal}
        roundOff={bill.roundOff}
        subtotal={bill.subtotal}
      />
    </div>
  );
}

export function BillTotals({
  discountPercent,
  discountTotal = 0,
  grandTotal,
  gstRates = [],
  gstTotal,
  roundOff,
  subtotal,
}: Readonly<{
  discountPercent?: number | null;
  discountTotal?: number;
  grandTotal: number;
  /** The GST rates on the bill, shown as "GST total (5%)". */
  gstRates?: number[];
  gstTotal: number;
  roundOff: number;
  subtotal: number;
}>) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between text-ds-text-3">
        <dt>Subtotal</dt>
        <dd className="font-mono">{formatMoney(subtotal)}</dd>
      </div>
      {discountTotal ? (
        <div className="flex justify-between text-ds-status-ok-fg">
          <dt>Staff discount{discountPercent ? ` (${discountPercent}%)` : ''}</dt>
          <dd className="font-mono">−{formatMoney(discountTotal)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between text-ds-text-3">
        <dt>
          GST total
          {gstRates.length
            ? ` (${[...gstRates]
                .sort((a, b) => a - b)
                .map((rate) => `${rate}%`)
                .join(' + ')})`
            : ''}
        </dt>
        <dd className="font-mono">{formatMoney(gstTotal)}</dd>
      </div>
      {roundOff ? (
        <div className="flex justify-between text-ds-text-3">
          <dt>Round off</dt>
          <dd className="font-mono">{formatMoney(roundOff)}</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between border-t border-ds-border pt-2 text-base font-bold text-ds-text">
        <dt>Grand total</dt>
        <dd className="font-mono text-xl">{formatMoney(grandTotal)}</dd>
      </div>
    </dl>
  );
}

/** One bill in a side panel: view, reprint the bill or KOT, and (with the right) cancel it. */
export function PosBillPanel({
  billId,
  onClose,
}: Readonly<{ billId: string | null; onClose: () => void }>) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const billQuery = useQuery({
    enabled: Boolean(billId),
    queryFn: async () => (await organizationApi.getPosBill(billId!)).data,
    queryKey: queryKeys.posBill(billId),
  });
  const cancel = useMutation({
    mutationFn: async () => (await organizationApi.cancelPosBill(billId!, reason.trim())).data,
    onError: (error) =>
      showToast({
        description: getApiErrorMessage(error),
        title: 'Could not cancel',
        variant: 'error',
      }),
    onSuccess: (bill) => {
      invalidatePosBillQueries(queryClient);
      setCancelling(false);
      setReason('');
      showToast({
        description: 'Its stock is back at the counter.',
        title: `${bill.billNumber} cancelled`,
        variant: 'success',
      });
    },
  });
  const bill = billQuery.data;
  const canCancel = hasPermission('POS_ORDER_CANCEL') && bill && bill.status !== 'CANCELLED';

  useEffect(() => {
    setCancelling(false);
    setReason('');
  }, [billId]);

  return (
    <Modal
      description={
        bill ? `${bill.restaurant.restaurantName} · ${bill.counter.counterName}` : undefined
      }
      footer={
        bill ? (
          cancelling ? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim()) {
                  cancel.mutate();
                }
              }}
            >
              <div className="min-w-60 flex-1">
                <Field label="Why is it cancelled?" name="cancel-reason" required>
                  <Input
                    autoFocus
                    id="cancel-reason"
                    maxLength={200}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="e.g. Wrong item billed"
                    value={reason}
                  />
                </Field>
              </div>
              <Button onClick={() => setCancelling(false)} type="button" variant="outline">
                Keep bill
              </Button>
              <Button
                className="bg-ds-status-bad-fg hover:bg-ds-status-bad-fg/90"
                disabled={!reason.trim() || cancel.isPending}
                type="submit"
              >
                {cancel.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                Cancel bill
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void printBill(bill, { duplicate: true })} type="button">
                <Printer className="h-4 w-4" />
                Print bill
              </Button>
              <Button onClick={() => printKot(bill)} type="button" variant="outline">
                <Printer className="h-4 w-4" />
                Print KOT
              </Button>
              {canCancel ? (
                <Button
                  className={cn('ml-auto text-ds-status-bad-fg')}
                  onClick={() => setCancelling(true)}
                  type="button"
                  variant="outline"
                >
                  <Ban className="h-4 w-4" />
                  Cancel bill
                </Button>
              ) : null}
            </div>
          )
        ) : null
      }
      onClose={onClose}
      open={billId !== null}
      side
      title={bill ? `Bill ${bill.billNumber}` : 'Bill'}
    >
      {bill ? (
        <BillSummary bill={bill} />
      ) : billQuery.isError ? (
        <p className="text-sm text-ds-status-bad-fg">{getApiErrorMessage(billQuery.error)}</p>
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </Modal>
  );
}
