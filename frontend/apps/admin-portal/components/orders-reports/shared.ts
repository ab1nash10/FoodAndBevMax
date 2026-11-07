import type { OrderReportRow, PaymentMode } from '@aahar/api-client';

export const paymentModeNames: Record<PaymentMode, string> = {
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
  UPI: 'UPI',
};

/** "UPI (Online)" when the gateway or card machine took it, "Cash (Manual)" when the cashier did. */
export function paymentLabel(
  row: Pick<OrderReportRow, 'isComplimentary' | 'online' | 'paymentMode'>,
): string {
  if (row.isComplimentary) return 'Complimentary';
  if (!row.paymentMode) return '–';

  return `${paymentModeNames[row.paymentMode]} (${row.online ? 'Online' : 'Manual'})`;
}

export const minutesLabel = (minutes: number | null) => (minutes === null ? '–' : `${minutes} Min`);

const stepTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  hour12: true,
  minute: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});

/** "05 Nov, 01:59 PM". */
export function formatStepTime(value: string): string {
  const parts = Object.fromEntries(
    stepTime.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );

  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

/** Each step the bill has been through, with when. */
export function historyOf(
  row: Pick<OrderReportRow, 'acceptedAt' | 'deliveredAt' | 'paidAt' | 'placedAt' | 'readyAt'>,
): Array<[string, string]> {
  const steps: Array<[string, string | null]> = [
    ['Ordered At', row.placedAt],
    ['Paid At', row.paidAt],
    ['Accepted At', row.acceptedAt],
    ['Ready At', row.readyAt],
    ['Delivered At', row.deliveredAt],
  ];

  return steps.flatMap(([label, value]) => (value ? [[label, formatStepTime(value)]] : []));
}

export type OrderType = '' | 'discounted' | 'non-discounted';

/** The Order Type filter as the API's `discounted`. */
export const orderTypeQuery = (type: OrderType) =>
  type === '' ? undefined : type === 'discounted';
