// next/navigation for component tests: a router that records where it was sent, and a path and
// query that follow the address bar as in Next. Lists keep their filters in the URL
// (lib/use-url-state writes them with history.replaceState), so a filter picked in a test reaches
// the screen's next query. Use with vi.mock('next/navigation', () => import('@/test/next-navigation')).
import { useMemo, useSyncExternalStore } from 'react';
import { vi } from 'vitest';

export const router = {
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
};

const listeners = new Set<() => void>();

for (const method of ['pushState', 'replaceState'] as const) {
  const original = window.history[method].bind(window.history);

  window.history[method] = (...args) => {
    original(...args);
    for (const listener of listeners) listener();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/** Opens the screen at this path and query, e.g. at('/masters/rooms', 'search=bed'). */
export function at(pathname: string, search = '') {
  window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}`);
}

export const useRouter = () => router;
export const usePathname = () => useSyncExternalStore(subscribe, () => window.location.pathname);
export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search);

  return useMemo(() => new URLSearchParams(search), [search]);
}
export const useParams = () => ({});
export const redirect = vi.fn();
export const notFound = vi.fn();
