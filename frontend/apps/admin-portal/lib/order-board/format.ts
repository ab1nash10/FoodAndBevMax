// Every AAHAR site is in India: the board shows India time whatever the TV is set to.
const SITE_TIME_ZONE = 'Asia/Kolkata';
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SITE_TIME_ZONE,
});

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: SITE_TIME_ZONE,
  weekday: 'short',
});

/** "Wed 22 Oct", in India time. */
export function formatDay(at: number): string {
  return dayFormat.format(at).replace(',', '');
}

/** "1:12 PM" */
export function formatTime(at: number | string): string {
  return timeFormat.format(typeof at === 'string' ? Date.parse(at) : at);
}

/** "Lunch · till 3:00 PM", or just the slot's name when it has no end. */
export function formatSlot(slotName: string, slotEndsAt?: string): string {
  return slotEndsAt ? `${slotName} · till ${formatTime(slotEndsAt)}` : slotName;
}
