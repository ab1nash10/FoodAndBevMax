import { useEffect, useState } from 'react';

/** Morning until 11:59, afternoon 12:00–15:59, evening from 16:00. */
export function greetingAt(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 16 ? 'Good afternoon' : 'Good evening';
}

/** The greeting for the current hour, re-checked every minute so an open page keeps up. */
export function useGreeting(): string {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  return greetingAt(hour);
}
