/**
 * When a restaurant's pickup board is open and which meal slot it is in. Times in the database
 * are "HH:mm" wall-clock times at the hospital; every AAHAR site is in India, which has one
 * time zone and no daylight saving, so a fixed +05:30 is exact.
 */
const SITE_OFFSET = '+05:30';
const SITE_TIME_ZONE = 'Asia/Kolkata';

export interface SlotWindow {
  endTime: string | null;
  slotName: string;
  startTime: string | null;
}

export interface OpeningRules {
  closingTime: string | null;
  isActive: boolean;
  offline: boolean;
  open24x7: boolean;
  openingTime: string | null;
}

export interface BoardSchedule {
  isOpen: boolean;
  /** When it next opens (ISO), while closed. */
  opensAt?: string;
  slotEndsAt?: string;
  slotName?: string;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);

  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** The site's date ("YYYY-MM-DD") and minute of the day at `now`. */
function siteClock(now: Date): { date: string; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone: SITE_TIME_ZONE,
      year: 'numeric',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** `time` on the site's day `date`, plus `addDays`, as an ISO instant. */
function siteInstant(date: string, time: string, addDays = 0): string {
  const day = new Date(`${date}T${time}:00${SITE_OFFSET}`);

  return new Date(day.getTime() + addDays * 24 * 60 * 60 * 1000).toISOString();
}

/** Whether `minute` falls in [from, to); a window that ends before it starts runs past midnight. */
function isWithin(from: string, to: string, minute: number): boolean {
  const start = toMinutes(from);
  const end = toMinutes(to);

  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Minutes from `minute` until `time` next comes round (0 to 1439). */
function minutesUntil(time: string, minute: number): number {
  return (toMinutes(time) - minute + 24 * 60) % (24 * 60);
}

/**
 * Open = the restaurant is active, not offline, and inside its opening hours (any time when
 * open 24x7 or when no hours are set) and, if timed meal slots exist, inside one of them.
 */
export function boardSchedule(
  restaurant: OpeningRules,
  slots: readonly SlotWindow[],
  now: Date,
): BoardSchedule {
  const { date, minute } = siteClock(now);
  const timed = slots.filter((slot): slot is SlotWindow & { endTime: string; startTime: string } =>
    Boolean(slot.startTime && slot.endTime),
  );
  const slot = timed.find((candidate) => isWithin(candidate.startTime, candidate.endTime, minute));
  const hasHours = !restaurant.open24x7 && restaurant.openingTime && restaurant.closingTime;
  const inHours =
    !hasHours ||
    isWithin(restaurant.openingTime as string, restaurant.closingTime as string, minute);
  const isOpen =
    restaurant.isActive && !restaurant.offline && inHours && (timed.length === 0 || Boolean(slot));

  const current = slot
    ? {
        slotEndsAt: siteInstant(date, slot.endTime, toMinutes(slot.endTime) <= minute ? 1 : 0),
        slotName: slot.slotName,
      }
    : {};

  if (isOpen || !restaurant.isActive || restaurant.offline) {
    return { isOpen, ...current };
  }

  // Closed for the hour: it opens at the next slot start (or opening time) that comes round.
  const starts = [
    ...timed.map((candidate) => candidate.startTime),
    ...(hasHours ? [restaurant.openingTime as string] : []),
  ];
  const next = starts.sort((a, b) => minutesUntil(a, minute) - minutesUntil(b, minute))[0];

  return {
    isOpen,
    ...current,
    ...(next ? { opensAt: siteInstant(date, next, toMinutes(next) <= minute ? 1 : 0) } : {}),
  };
}
