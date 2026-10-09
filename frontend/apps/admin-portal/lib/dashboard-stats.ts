import type { Grn, KitchenProduction, Transfer } from '@aahar/api-client';

/**
 * Dashboard numbers, computed in the portal from the list endpoints (there is no summary
 * endpoint). Pure functions of the records and "now", so `scripts/dashboard-stats.test.mjs`
 * checks them directly; `hooks/use-dashboard-stats.ts` fetches the records and calls these.
 * No React and no `@/` imports, for the node test.
 */

export type Period = 7 | 30 | 90;
export const periods: readonly Period[] = [7, 30, 90];
/** Kitchen wastage target, as a percentage of produced quantity. */
export const WASTAGE_LIMIT = 5;
/** A GRN vendor is flagged above this share of rejected quantity, as a percentage. */
export const VENDOR_REJECT_LIMIT = 5;

const HOUR = 3_600_000;

export interface Bucket {
  end: number;
  /** For the detail line and screen readers, e.g. "Wed, 30 Sept" or "Week of 9 Jul". */
  fullLabel: string;
  /** Axis label; empty where the axis would get crowded (30 days shows every fifth day). */
  label: string;
  start: number;
}

export interface PeriodWindow {
  buckets: Bucket[];
  end: number;
  period: Period;
  /** Start of the equally long period before this one, for deltas. */
  prevStart: number;
  start: number;
}

const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const longDay = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  weekday: 'short',
});

/** The period ending now: whole local days, per day for 7 and 30, per week for 90. */
export function periodWindow(period: Period, now: Date): PeriodWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (period - 1));
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - period);
  const step = period === 90 ? 7 : 1;
  const buckets: Bucket[] = [];

  for (let day = 0; day < period; day += step) {
    const from = new Date(start);
    from.setDate(from.getDate() + day);
    const to = new Date(start);
    to.setDate(to.getDate() + Math.min(day + step, period));
    const index = buckets.length;
    const isLast = day + step >= period;

    buckets.push({
      end: to.getTime(),
      fullLabel: step === 7 ? `Week of ${dayMonth.format(from)}` : longDay.format(from),
      label:
        period === 7
          ? `${weekday.format(from)} ${from.getDate()}`
          : period === 30 && index % 5 !== 0 && !isLast
            ? ''
            : dayMonth.format(from),
      start: from.getTime(),
    });
  }

  return {
    buckets,
    end: now.getTime(),
    period,
    prevStart: prevStart.getTime(),
    start: start.getTime(),
  };
}

function bucketOf(window: PeriodWindow, time: number): number {
  return window.buckets.findIndex((bucket) => time >= bucket.start && time < bucket.end);
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export interface OutcomeCounts {
  full: number;
  partial: number;
  pending: number;
  rejected: number;
}

const noOutcomes = (): OutcomeCounts => ({ full: 0, partial: 0, pending: 0, rejected: 0 });

/**
 * How an acknowledged transfer ended, from its lines: nothing accepted is a full rejection,
 * any rejected quantity a partial one. Null until it is acknowledged.
 */
export function transferOutcome(
  transfer: Transfer,
): 'ACCEPTED_FULL' | 'ACCEPTED_PARTIAL' | 'REJECTED_FULL' | null {
  if (transfer.status !== 'ACKNOWLEDGED') {
    return null;
  }

  const accepted = sum(transfer.lines.map((line) => line.acceptedQty));
  const rejected = sum(transfer.lines.map((line) => line.rejectedQty));

  return accepted <= 0 ? 'REJECTED_FULL' : rejected > 0 ? 'ACCEPTED_PARTIAL' : 'ACCEPTED_FULL';
}

/** A sent transfer's outcome; drafts and cancelled transfers have none. */
export function outcomeOf(transfer: Transfer): keyof OutcomeCounts | null {
  if (transfer.status === 'PENDING_ACKNOWLEDGEMENT') {
    return 'pending';
  }

  const outcome = transferOutcome(transfer);

  return outcome === 'ACCEPTED_FULL'
    ? 'full'
    : outcome === 'ACCEPTED_PARTIAL'
      ? 'partial'
      : outcome === 'REJECTED_FULL'
        ? 'rejected'
        : null;
}

/**
 * Minutes from sending to acknowledgement. An acknowledged transfer's updatedAt is the
 * acknowledgement (nothing edits it afterwards); createdAt stands in for the dispatch, which
 * the API does not record separately, so a draft sent later reads slower than it was.
 */
export function ackMinutes(transfer: Transfer): number | null {
  if (transfer.status !== 'ACKNOWLEDGED') {
    return null;
  }

  return Math.max(0, (Date.parse(transfer.updatedAt) - Date.parse(transfer.createdAt)) / 60_000);
}

const average = (values: number[]) => (values.length ? sum(values) / values.length : null);

export interface HospitalTally {
  ackMinutes: number[];
  code: string;
  count: number;
  name: string;
  produced: number;
  wasted: number;
}

export interface TransferStats {
  ackAvgMinutes: number | null;
  ackPrevAvgMinutes: number | null;
  /** Average minutes to acknowledge per bucket (null where nothing was acknowledged). */
  ackSeries: Array<number | null>;
  /** Share of acknowledged transfers acknowledged within an hour, 0–1. */
  ackWithinHour: number | null;
  count: number;
  countSeries: number[];
  hospitals: Map<string, HospitalTally>;
  outcomeSeries: OutcomeCounts[];
  outcomes: OutcomeCounts;
  prevCount: number;
  topItems: Array<{ count: number; id: string; name: string }>;
  topRejectionReason: string | null;
}

function tally(hospitals: Map<string, HospitalTally>, hospital: Transfer['hospital']) {
  let entry = hospitals.get(hospital.id);

  if (!entry) {
    entry = {
      ackMinutes: [],
      code: hospital.hospitalCode,
      count: 0,
      name: hospital.displayName || hospital.hospitalName,
      produced: 0,
      wasted: 0,
    };
    hospitals.set(hospital.id, entry);
  }

  return entry;
}

/** Sent transfers (pending or acknowledged) by transfer date; drafts and cancelled ones are left out. */
export function transferStats(transfers: Transfer[], window: PeriodWindow): TransferStats {
  const outcomeSeries = window.buckets.map(noOutcomes);
  const ackByBucket = window.buckets.map((): number[] => []);
  const outcomes = noOutcomes();
  const hospitals = new Map<string, HospitalTally>();
  const items = new Map<string, { count: number; id: string; name: string }>();
  const reasons = new Map<string, { count: number; text: string }>();
  const ack: number[] = [];
  const prevAck: number[] = [];
  let count = 0;
  let prevCount = 0;

  for (const transfer of transfers) {
    const outcome = outcomeOf(transfer);
    const time = Date.parse(transfer.transferDate);

    if (!outcome) {
      continue;
    }

    const minutes = ackMinutes(transfer);

    if (time >= window.prevStart && time < window.start) {
      prevCount += 1;
      if (minutes !== null) prevAck.push(minutes);
      continue;
    }

    const index = bucketOf(window, time);

    if (index < 0) {
      continue;
    }

    count += 1;
    outcomes[outcome] += 1;
    outcomeSeries[index]![outcome] += 1;
    const hospital = tally(hospitals, transfer.hospital);
    hospital.count += 1;

    if (minutes !== null) {
      ack.push(minutes);
      ackByBucket[index]!.push(minutes);
      hospital.ackMinutes.push(minutes);
    }

    for (const line of transfer.lines) {
      const entry = items.get(line.itemId) ?? {
        count: 0,
        id: line.itemId,
        name: line.item.itemName,
      };
      entry.count += 1;
      items.set(line.itemId, entry);

      const reason = line.rejectedQty > 0 ? line.rejectionReason?.trim() : undefined;

      if (reason) {
        const key = reason.toLowerCase();
        const seen = reasons.get(key) ?? { count: 0, text: reason };
        seen.count += 1;
        reasons.set(key, seen);
      }
    }
  }

  const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;

  return {
    ackAvgMinutes: average(ack),
    ackPrevAvgMinutes: average(prevAck),
    ackSeries: ackByBucket.map(average),
    ackWithinHour: ack.length ? ack.filter((minutes) => minutes <= 60).length / ack.length : null,
    count,
    countSeries: outcomeSeries.map((b) => b.full + b.partial + b.rejected + b.pending),
    hospitals,
    outcomeSeries,
    outcomes,
    prevCount,
    topItems: [...items.values()]
      .sort((a, b) => byCount(a, b) || a.name.localeCompare(b.name))
      .slice(0, 6),
    topRejectionReason: [...reasons.values()].sort(byCount)[0]?.text ?? null,
  };
}

export interface PendingStats {
  hospitals: Map<string, number>;
  oldest: Transfer | null;
  /** Of the fetched pending transfers, how many were sent over an hour ago. */
  overHour: number;
  total: number;
}

/** Pending transfers right now. A pending transfer's updatedAt is its dispatch. */
export function pendingStats(pending: Transfer[], total: number, now: number): PendingStats {
  const hospitals = new Map<string, number>();
  let oldest: Transfer | null = null;

  for (const transfer of pending) {
    hospitals.set(transfer.hospitalId, (hospitals.get(transfer.hospitalId) ?? 0) + 1);

    if (!oldest || Date.parse(transfer.updatedAt) < Date.parse(oldest.updatedAt)) {
      oldest = transfer;
    }
  }

  return {
    hospitals,
    oldest,
    overHour: pending.filter((transfer) => now - Date.parse(transfer.updatedAt) > HOUR).length,
    total,
  };
}

export interface WastageStats {
  avgPercent: number | null;
  /** The single worst line in the period. */
  highest: {
    itemName: string;
    kitchenName: string;
    percent: number;
    productionId: string;
    when: number;
  } | null;
  hospitals: Map<string, { produced: number; wasted: number }>;
  kitchens: number;
  /** Posted productions in the period. */
  posted: number;
  /**
   * Days (weeks, for 90 days) on which some kitchen went over the limit. Counted per kitchen,
   * like the warning insight, since the all-kitchen average can hide one kitchen's bad day.
   */
  overLimit: number;
  prevAvgPercent: number | null;
  series: Array<number | null>;
  /** The worst kitchen-day above the limit, for the warning insight. */
  worstKitchenDay: {
    hospitalName: string;
    kitchenId: string;
    kitchenName: string;
    percent: number;
    when: number;
  } | null;
}

const percentOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

/** Posted productions: wasted quantity as a share of produced quantity, weighted by quantity. */
export function wastageStats(productions: KitchenProduction[], window: PeriodWindow): WastageStats {
  const buckets = window.buckets.map(() => ({ produced: 0, wasted: 0 }));
  const hospitals = new Map<string, { produced: number; wasted: number }>();
  const kitchenDays = new Map<
    string,
    WastageStats['worstKitchenDay'] & { produced: number; wasted: number }
  >();
  const kitchens = new Set<string>();
  const current = { produced: 0, wasted: 0 };
  const previous = { produced: 0, wasted: 0 };
  let highest: WastageStats['highest'] = null;
  let posted = 0;

  for (const production of productions) {
    if (production.status !== 'POSTED') {
      continue;
    }

    const time = Date.parse(production.productionDate);
    const produced = sum(production.lines.map((line) => line.producedQty));
    const wasted = sum(production.lines.map((line) => line.wastageQty));

    if (time >= window.prevStart && time < window.start) {
      previous.produced += produced;
      previous.wasted += wasted;
      continue;
    }

    const index = bucketOf(window, time);

    if (index < 0) {
      continue;
    }

    posted += 1;
    current.produced += produced;
    current.wasted += wasted;
    buckets[index]!.produced += produced;
    buckets[index]!.wasted += wasted;
    kitchens.add(production.kitchenId);
    const hospital = hospitals.get(production.hospitalId) ?? { produced: 0, wasted: 0 };
    hospital.produced += produced;
    hospital.wasted += wasted;
    hospitals.set(production.hospitalId, hospital);

    const dayStart = new Date(time);
    dayStart.setHours(0, 0, 0, 0);
    const dayKey = `${production.kitchenId}:${dayStart.getTime()}`;
    const day = kitchenDays.get(dayKey) ?? {
      hospitalName: production.hospital.displayName || production.hospital.hospitalName,
      kitchenId: production.kitchenId,
      kitchenName: production.kitchen.kitchenName,
      percent: 0,
      produced: 0,
      wasted: 0,
      when: dayStart.getTime(),
    };
    day.produced += produced;
    day.wasted += wasted;
    day.percent = percentOf(day.wasted, day.produced) ?? 0;
    kitchenDays.set(dayKey, day);

    for (const line of production.lines) {
      const percent = percentOf(line.wastageQty, line.producedQty);

      if (percent !== null && (!highest || percent > highest.percent)) {
        highest = {
          itemName: line.item.itemName,
          kitchenName: production.kitchen.kitchenName,
          percent,
          productionId: production.id,
          when: time,
        };
      }
    }
  }

  const series = buckets.map((bucket) => percentOf(bucket.wasted, bucket.produced));
  const worst = [...kitchenDays.values()]
    .filter((day) => day.percent > WASTAGE_LIMIT)
    .sort((a, b) => b.percent - a.percent)[0];

  return {
    avgPercent: percentOf(current.wasted, current.produced),
    highest,
    hospitals,
    kitchens: kitchens.size,
    posted,
    overLimit: new Set(
      [...kitchenDays.values()]
        .filter((day) => day.percent > WASTAGE_LIMIT)
        .map((day) => bucketOf(window, day.when)),
    ).size,
    prevAvgPercent: percentOf(previous.wasted, previous.produced),
    series,
    worstKitchenDay: worst
      ? {
          hospitalName: worst.hospitalName,
          kitchenId: worst.kitchenId,
          kitchenName: worst.kitchenName,
          percent: worst.percent,
          when: worst.when,
        }
      : null,
  };
}

export interface VendorRow {
  accepted: number;
  /** Share of received quantity accepted, 0–100. */
  acceptedPercent: number;
  flagged: boolean;
  grns: number;
  name: string;
  rejected: number;
}

/** Posted GRNs in the period, by vendor: accepted vs rejected quantity. */
export function vendorRows(grns: Grn[], window: PeriodWindow, limit = 4): VendorRow[] {
  const vendors = new Map<string, Omit<VendorRow, 'acceptedPercent' | 'flagged'>>();

  for (const grn of grns) {
    const time = Date.parse(grn.receivedDate);

    if (grn.status !== 'POSTED_TO_STOCK' || time < window.start || time > window.end) {
      continue;
    }

    const name = grn.vendorName?.trim() || 'No vendor';
    const vendor = vendors.get(name.toLowerCase()) ?? { accepted: 0, grns: 0, name, rejected: 0 };
    vendor.grns += 1;
    vendor.accepted += sum(grn.lines.map((line) => line.acceptedQty));
    vendor.rejected += sum(grn.lines.map((line) => line.rejectedQty));
    vendors.set(name.toLowerCase(), vendor);
  }

  return [...vendors.values()]
    .filter((vendor) => vendor.accepted + vendor.rejected > 0)
    .map((vendor) => {
      const acceptedPercent = (vendor.accepted / (vendor.accepted + vendor.rejected)) * 100;

      return { ...vendor, acceptedPercent, flagged: 100 - acceptedPercent > VENDOR_REJECT_LIMIT };
    })
    .sort(
      (a, b) =>
        b.grns - a.grns || a.acceptedPercent - b.acceptedPercent || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

export interface LocationRow {
  ackAvgMinutes: number | null;
  code: string;
  id: string;
  name: string;
  pending: number;
  transfers: number;
  wastagePercent: number | null;
}

/** One row per location (hospital) with any transfers, pending transfers or production. */
export function locationRows(
  transfers: TransferStats | undefined,
  pending: PendingStats | undefined,
  wastage: WastageStats | undefined,
  names: Map<string, { code: string; name: string }>,
): { rows: LocationRow[]; totals: Omit<LocationRow, 'code' | 'id' | 'name'> } {
  const ids = new Set([
    ...(transfers?.hospitals.keys() ?? []),
    ...(pending?.hospitals.keys() ?? []),
    ...(wastage?.hospitals.keys() ?? []),
  ]);
  const rows = [...ids].map((id): LocationRow => {
    const tallied = transfers?.hospitals.get(id);
    const waste = wastage?.hospitals.get(id);
    const known =
      names.get(id) ?? (tallied ? { code: tallied.code, name: tallied.name } : undefined);

    return {
      ackAvgMinutes: tallied ? average(tallied.ackMinutes) : null,
      code: known?.code ?? '',
      id,
      name: known?.name ?? 'Location',
      pending: pending?.hospitals.get(id) ?? 0,
      transfers: tallied?.count ?? 0,
      wastagePercent: waste ? percentOf(waste.wasted, waste.produced) : null,
    };
  });
  const allAck = [...(transfers?.hospitals.values() ?? [])].flatMap(
    (hospital) => hospital.ackMinutes,
  );
  const allWaste = [...(wastage?.hospitals.values() ?? [])];

  return {
    rows,
    totals: {
      ackAvgMinutes: average(allAck),
      pending: pending?.total ?? 0,
      transfers: transfers?.count ?? 0,
      wastagePercent: percentOf(
        sum(allWaste.map((w) => w.wasted)),
        sum(allWaste.map((w) => w.produced)),
      ),
    },
  };
}

export type DeltaTone = 'bad' | 'good' | 'info' | 'neutral';

export interface Delta {
  text: string;
  tone: DeltaTone;
}

/**
 * Change against the previous period. `better` says which direction is good; "info" colours
 * a change that is neither (transfer volume). No previous value, no delta.
 */
export function percentDelta(
  current: number | null,
  previous: number | null,
  better: 'down' | 'none' | 'up',
): Delta | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }

  const change = Math.round(((current - previous) / previous) * 100);

  if (change === 0) {
    return { text: 'No change', tone: 'neutral' };
  }

  const up = change > 0;

  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(change)}%`,
    tone: better === 'none' ? 'info' : (better === 'up') === up ? 'good' : 'bad',
  };
}

/** Change in percentage points (wastage), lower is better. */
export function pointsDelta(current: number | null, previous: number | null): Delta | null {
  if (current === null || previous === null) {
    return null;
  }

  const change = Math.round((current - previous) * 10) / 10;

  if (change === 0) {
    return { text: 'No change', tone: 'neutral' };
  }

  return {
    text: `${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)} pts`,
    tone: change > 0 ? 'bad' : 'good',
  };
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) {
    return '—';
  }

  if (minutes < 1) {
    return '<1 min';
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;
  }

  return `${Math.round(hours / 24)}d`;
}

export const formatPercent = (value: number | null, digits = 1) =>
  value === null ? '—' : `${value.toFixed(digits)}%`;

export type InsightTone = 'bad' | 'good' | 'warning';

export interface Insight {
  cta: string;
  href: string;
  title: string;
  tone: InsightTone;
}

const periodWord = (period: Period) =>
  period === 7 ? 'week' : period === 30 ? 'month' : 'quarter';
const dateParam = (period: Period) => `date=${period}d`;
const weekdayLong = new Intl.DateTimeFormat('en-IN', { weekday: 'long' });

/**
 * Up to three "what changed" cards from the numbers, one of each tone when there is one:
 * nothing is invented, so a quiet period shows fewer (or only good) cards.
 */
export function insights(input: {
  pending?: PendingStats;
  period: Period;
  transfers?: TransferStats;
  vendors?: VendorRow[];
  wastage?: WastageStats;
}): Insight[] {
  const { pending, period, transfers, vendors, wastage } = input;
  const candidates: Insight[] = [];
  const word = periodWord(period);
  const acked = transfers
    ? transfers.outcomes.full + transfers.outcomes.partial + transfers.outcomes.rejected
    : 0;

  if (transfers && transfers.ackAvgMinutes !== null && transfers.ackPrevAvgMinutes) {
    const change = Math.round(
      ((transfers.ackAvgMinutes - transfers.ackPrevAvgMinutes) / transfers.ackPrevAvgMinutes) * 100,
    );

    if (change <= -5) {
      candidates.push({
        cta: 'See transfers',
        href: `/inventory/transfers?view=ACKNOWLEDGED&${dateParam(period)}`,
        title: `Acknowledgements are ${Math.abs(change)}% faster than the previous ${word}`,
        tone: 'good',
      });
    } else if (change >= 5) {
      candidates.push({
        cta: 'See transfers',
        href: `/inventory/transfers?view=ACKNOWLEDGED&${dateParam(period)}`,
        title: `Acknowledgements are ${change}% slower than the previous ${word}`,
        tone: 'warning',
      });
    }
  }

  if (wastage?.worstKitchenDay) {
    const day = wastage.worstKitchenDay;
    candidates.push({
      cta: 'Open production',
      href: `/kitchen/productions?view=POSTED&kitchen=${day.kitchenId}`,
      title: `${day.kitchenName}, ${day.hospitalName} wasted ${day.percent.toFixed(1)}% on ${weekdayLong.format(day.when)} — above the ${WASTAGE_LIMIT}% limit`,
      tone: 'warning',
    });
  } else if (wastage && wastage.avgPercent !== null) {
    candidates.push({
      cta: 'Open production',
      href: '/kitchen/productions?view=POSTED',
      title: `Kitchen wastage stayed within the ${WASTAGE_LIMIT}% limit this ${word}`,
      tone: 'good',
    });
  }

  const worstVendor = vendors
    ?.filter((vendor) => vendor.flagged)
    .sort((a, b) => a.acceptedPercent - b.acceptedPercent)[0];

  if (worstVendor) {
    candidates.push({
      cta: 'Review GRNs',
      href: `/inventory/grns?view=POSTED_TO_STOCK&q=${encodeURIComponent(worstVendor.name)}`,
      title: `${worstVendor.name}: ${Math.round(100 - worstVendor.acceptedPercent)}% of quantity rejected ${worstVendor.grns === 1 ? 'in its only GRN this period' : `across ${worstVendor.grns} GRNs`}`,
      tone: 'bad',
    });
  }

  if (transfers && transfers.outcomes.rejected > 0) {
    candidates.push({
      cta: 'See transfers',
      href: `/inventory/transfers?view=ACKNOWLEDGED&${dateParam(period)}`,
      title: `${transfers.outcomes.rejected === 1 ? '1 transfer was' : `${transfers.outcomes.rejected} transfers were`} rejected in full this ${word}`,
      tone: 'bad',
    });
  }

  if (pending && pending.overHour > 0) {
    candidates.push({
      cta: 'Review pending',
      href: '/inventory/transfers?view=PENDING_ACKNOWLEDGEMENT',
      title: `${pending.overHour === 1 ? '1 transfer has' : `${pending.overHour} transfers have`} waited over an hour to be acknowledged`,
      tone: 'warning',
    });
  }

  if (transfers && acked >= 5 && transfers.outcomes.full / acked >= 0.9) {
    candidates.push({
      cta: 'See transfers',
      href: `/inventory/transfers?view=ACKNOWLEDGED&${dateParam(period)}`,
      title: `${Math.round((transfers.outcomes.full / acked) * 100)}% of acknowledged transfers were accepted in full`,
      tone: 'good',
    });
  }

  if (transfers && transfers.prevCount > 0) {
    const change = Math.round(
      ((transfers.count - transfers.prevCount) / transfers.prevCount) * 100,
    );

    if (change >= 10) {
      candidates.push({
        cta: 'See transfers',
        href: `/inventory/transfers?${dateParam(period)}`,
        title: `${change}% more transfers than the previous ${word}`,
        tone: 'good',
      });
    }
  }

  // One of each tone first (good, warning, bad), then whatever is left, up to three.
  const picked: Insight[] = [];

  for (const tone of ['good', 'warning', 'bad'] as const) {
    const first = candidates.find((candidate) => candidate.tone === tone);
    if (first) picked.push(first);
  }

  for (const candidate of candidates) {
    if (picked.length >= 3) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }

  const order = { bad: 2, good: 0, warning: 1 };

  return picked.slice(0, 3).sort((a, b) => order[a.tone] - order[b.tone]);
}

export interface SetupCounts {
  employees?: number;
  hospitals?: number;
  items?: number;
  kitchenItems?: number;
  kitchens?: number;
  menus?: number;
  restaurants?: number;
  storeItems?: number;
  stores?: number;
}

export interface SetupStep {
  cta?: { href: string; label: string };
  detail: string;
  /** The next step to take: the first one not done. */
  doing: boolean;
  done: boolean;
  key: string;
  title: string;
}

const added = (count: number) => `${count} added`;

/**
 * The "Finish setting up AAHAR" checklist from real counts. A step the user cannot see (its
 * count is undefined) is left out; a call to action shows only where `canOpen` allows it.
 */
export function setupSteps(
  counts: SetupCounts,
  firsts: { grn?: Grn | null; transfer?: Transfer | null },
  canOpen: (href: string) => boolean,
): SetupStep[] {
  const steps: Array<Omit<SetupStep, 'doing'> | null> = [];
  const countStep = (
    key: keyof SetupCounts,
    title: string,
    todo: string,
    cta: { href: string; label: string },
  ) => {
    const count = counts[key];

    steps.push(
      count === undefined
        ? null
        : { cta, detail: count > 0 ? added(count) : todo, done: count > 0, key, title },
    );
  };

  countStep('hospitals', 'Locations', 'Add the hospitals you run', {
    href: '/masters/locations/new',
    label: 'Add location',
  });
  countStep('stores', 'Stores', 'Where goods are received', {
    href: '/masters/stores/new',
    label: 'Add store',
  });
  countStep('kitchens', 'Kitchens', 'Where food is produced', {
    href: '/masters/kitchens/new',
    label: 'Add kitchen',
  });
  countStep('restaurants', 'Restaurants', 'Where food is served', {
    href: '/masters/restaurants/new',
    label: 'Add restaurant',
  });
  countStep('employees', 'Employees', 'Invite your team', {
    href: '/masters/employees/new',
    label: 'Add employee',
  });
  countStep('items', 'Items', 'Your menu and raw materials', {
    href: '/masters/items/new',
    label: 'Add items',
  });

  if (counts.storeItems !== undefined || counts.kitchenItems !== undefined) {
    const storeDone = (counts.storeItems ?? 1) > 0;
    const kitchenDone = (counts.kitchenItems ?? 1) > 0;

    steps.push({
      cta: {
        href: storeDone ? '/masters/kitchen-items' : '/masters/store-items',
        label: 'Map items',
      },
      detail:
        storeDone && kitchenDone
          ? [
              counts.storeItems !== undefined ? `${counts.storeItems} store` : '',
              counts.kitchenItems !== undefined ? `${counts.kitchenItems} kitchen` : '',
            ]
              .filter(Boolean)
              .join(' · ') + ' mappings'
          : 'Only mapped items can be received or produced',
      done: storeDone && kitchenDone,
      key: 'mappings',
      title: 'Map items to stores & kitchens',
    });
  }

  if (counts.menus !== undefined) {
    const menusDone = counts.menus > 0;

    steps.push({
      cta: { href: '/masters/restaurant-menus', label: 'Build menus' },
      detail: menusDone ? 'Menus set' : 'Decide what each restaurant serves, and when',
      done: menusDone,
      key: 'menus',
      title: 'Restaurant menus',
    });
  }

  if (firsts.grn !== undefined) {
    steps.push({
      cta: { href: '/inventory/grns/new', label: 'New GRN' },
      detail: firsts.grn
        ? `${firsts.grn.grnNumber} · ${firsts.grn.store.storeName}`
        : 'Receive goods into a store',
      done: Boolean(firsts.grn),
      key: 'grn',
      title: 'First GRN posted',
    });
  }

  if (firsts.transfer !== undefined) {
    steps.push({
      cta: { href: '/inventory/transfers/new', label: 'New transfer' },
      detail: firsts.transfer
        ? `${firsts.transfer.transferNumber} · ${firsts.transfer.hospital.displayName || firsts.transfer.hospital.hospitalName}`
        : 'Send stock to a restaurant and have it acknowledged',
      done: Boolean(firsts.transfer),
      key: 'transfer',
      title: 'First transfer acknowledged',
    });
  }

  const visible = steps.filter((step): step is Omit<SetupStep, 'doing'> => step !== null);
  const next = visible.findIndex((step) => !step.done);

  return visible.map((step, index) => ({
    ...step,
    cta: !step.done && step.cta && canOpen(step.cta.href) ? step.cta : undefined,
    doing: index === next,
  }));
}

/**
 * "new" while a workspace is getting going: nothing was sent in the period and setup is
 * unfinished. Only for users who can see transfers (otherwise the rule cannot be judged).
 */
export function dashboardMode(input: {
  canSeeTransfers: boolean;
  steps: SetupStep[];
  transfersInPeriod: number;
}): 'live' | 'new' {
  return input.canSeeTransfers &&
    input.transfersInPeriod === 0 &&
    input.steps.some((step) => !step.done)
    ? 'new'
    : 'live';
}
