const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

/** "7:00 am – 10:30 am", or "All day" without both times; ending before it starts runs past midnight. */
export function hoursRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return 'All day';
  const at = (value: string) => clock.format(new Date(`2000-01-01T${value}:00`));
  const overnight = end < start ? ' (next day)' : '';

  return `${at(start)} – ${at(end)}${overnight}`;
}
