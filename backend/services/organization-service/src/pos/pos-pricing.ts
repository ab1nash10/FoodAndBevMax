import { isWithin, siteClock } from '../restaurant-orders/board-schedule';

export interface PricedInput {
  /** Staff discount on this line, 0 when the item is not discountable. */
  discountPercent?: number;
  gstPercent: number;
  isGstInclusive: boolean;
  quantity: number;
  unitPrice: number;
}

export interface PricedLine {
  discountAmount: number;
  gstAmount: number;
  lineTotal: number;
  taxableAmount: number;
}

export interface BillTotals {
  discountTotal: number;
  grandTotal: number;
  gstTotal: number;
  lines: PricedLine[];
  roundOff: number;
  subtotal: number;
}

const toPaise = (rupees: number) => Math.round(rupees * 100);
const toRupees = (paise: number) => paise / 100;

/**
 * Prices a bill the way it is printed. Everything is worked in paise. GST is charged as CGST and
 * SGST, half each, and each half is rounded to the paisa, so the two printed halves always add
 * up to the GST total. An inclusive price keeps its total and the taxable value is what is left
 * after GST (₹209 at 5%: 199.04 + 4.98 + 4.98, as the previous POS printed it); an exclusive
 * price has GST added. A staff discount comes off the taxable value and GST is charged on what
 * is left. The grand total is rounded to the rupee, the difference shown as round-off.
 */
export function priceBill(inputs: readonly PricedInput[]): BillTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let gstTotal = 0;
  const lines = inputs.map(
    ({ discountPercent = 0, gstPercent, isGstInclusive, quantity, unitPrice }) => {
      const gross = toPaise(unitPrice) * quantity;
      // GST rates have at most two decimals (2.5, 18), so basis points keep this in integers.
      const rate = Math.round(gstPercent * 100);
      const listGst =
        2 *
        Math.round(
          isGstInclusive ? (gross * rate) / (2 * (10_000 + rate)) : (gross * rate) / 20_000,
        );
      const listTaxable = isGstInclusive ? gross - listGst : gross;
      const discount = Math.round((listTaxable * Math.round(discountPercent * 100)) / 10_000);
      const taxable = listTaxable - discount;
      // An undiscounted line keeps the GST worked from its price, so an inclusive price still
      // totals exactly what the menu says.
      const gst = discount ? 2 * Math.round((taxable * rate) / 20_000) : listGst;

      subtotal += listTaxable;
      discountTotal += discount;
      gstTotal += gst;

      return {
        discountAmount: toRupees(discount),
        gstAmount: toRupees(gst),
        lineTotal: toRupees(taxable + gst),
        taxableAmount: toRupees(taxable),
      };
    },
  );
  const exact = subtotal - discountTotal + gstTotal;
  const grand = Math.round(exact / 100) * 100;

  return {
    discountTotal: toRupees(discountTotal),
    grandTotal: toRupees(grand),
    gstTotal: toRupees(gstTotal),
    lines,
    roundOff: toRupees(grand - exact),
    subtotal: toRupees(subtotal),
  };
}

const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

/** The site's business date (India) at `now`, as YYYY-MM-DD. */
export function siteBusinessDate(now: Date): string {
  return siteClock(now).date;
}

/**
 * Whether a menu item is on sale at `now`: switched on, on one of its days (none = every day)
 * and inside its HH:mm window (none = all day; one that ends before it starts runs past midnight).
 */
export function isOnSale(
  menu: {
    availableFrom: string | null;
    availableTo: string | null;
    daysOfWeek: readonly string[];
    isAvailable: boolean;
  },
  now: Date,
): boolean {
  return (
    menu.isAvailable &&
    isInSchedule({ days: menu.daysOfWeek, from: menu.availableFrom, to: menu.availableTo }, now)
  );
}

/**
 * Whether `now` (site time, India) falls on one of `days` (none = every day) and inside the HH:mm
 * window (none = all day; one that ends before it starts runs past midnight). Menus' on-sale hours
 * and employee discounts' serve days and special timings both use it.
 */
export function isInSchedule(
  schedule: { days: readonly string[]; from: string | null; to: string | null },
  now: Date,
): boolean {
  const { date, minute } = siteClock(now);
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

  return (
    (schedule.days.length === 0 || schedule.days.includes(weekday as string)) &&
    (!schedule.from || !schedule.to || isWithin(schedule.from, schedule.to, minute))
  );
}
