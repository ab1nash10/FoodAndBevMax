'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type SetStateAction,
} from 'react';

/**
 * List state that lives in the URL (`?q=`, `?view=`, `?page=`…), so a refresh, a shared link
 * or the back button lands on the same list. Updates go through the History API, which Next
 * keeps in sync with `useSearchParams`: no server round-trip per keystroke, no scroll jump.
 * Opening a record is a real `<Link>` (see `useHrefWith`), so it is a history entry.
 */
function writeParams(patch: Record<string, string | null>, mode: 'push' | 'replace' = 'replace') {
  const params = new URLSearchParams(window.location.search);

  for (const [key, value] of Object.entries(patch)) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;

  window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
}

/** Remove (or set) query params in place, e.g. closing a panel: `setUrlParams({ id: null })`. */
export function setUrlParams(
  patch: Record<string, string | null>,
  mode: 'push' | 'replace' = 'replace',
) {
  writeParams(patch, mode);
}

/** A string in the query, with `useState`'s shape. The fallback is left out of the URL. */
export function useUrlParam<T extends string = string>(
  name: string,
  fallback: T = '' as T,
  allowed?: readonly T[],
): [T, (next: SetStateAction<T>) => void] {
  const searchParams = useSearchParams();
  const raw = searchParams.get(name);
  const value = (raw !== null && (!allowed || allowed.includes(raw as T)) ? raw : fallback) as T;
  const valueRef = useRef(value);
  valueRef.current = value;

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      const resolved = typeof next === 'function' ? next(valueRef.current) : next;

      if (resolved === valueRef.current) {
        return;
      }

      // Two setters in one handler (filter + page) must see each other's change.
      valueRef.current = resolved;
      writeParams({ [name]: resolved === fallback ? null : resolved });
    },
    [fallback, name],
  );

  return [value, setValue];
}

/** A positive integer in the query (`?page=3`), with `useState`'s shape. */
export function useUrlNumberParam(
  name: string,
  fallback = 1,
): [number, (next: SetStateAction<number>) => void] {
  const [raw, setRaw] = useUrlParam(name, String(fallback));
  const parsed = Number.parseInt(raw, 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  const valueRef = useRef(value);
  valueRef.current = value;

  const setValue = useCallback(
    (next: SetStateAction<number>) => {
      const resolved = typeof next === 'function' ? next(valueRef.current) : next;
      valueRef.current = resolved;
      setRaw(String(resolved));
    },
    [setRaw],
  );

  return [value, setValue];
}

/** An in-app href for this page with some query params changed, for `<Link>`s to records. */
export function useHrefWith(): (patch: Record<string, string | null>) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (patch) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(patch)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }

      const query = params.toString();

      return `${pathname}${query ? `?${query}` : ''}`;
    },
    [pathname, searchParams],
  );
}

/**
 * Runs `onChange` when the top-bar location really changes, not while it first loads, so
 * filters restored from the URL are not wiped on arrival.
 */
export function useOnScopeChange(
  scope: string | undefined,
  isLoading: boolean,
  onChange: () => void,
) {
  const settled = useRef<{ value: string | undefined } | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (settled.current && settled.current.value !== scope) {
      callback.current();
    }

    settled.current = { value: scope };
  }, [isLoading, scope]);
}

/** A table row click opens the row's record link (`data-row-link`), unless it hit a control. */
export function openRowLink(event: MouseEvent<HTMLTableRowElement>) {
  if ((event.target as HTMLElement).closest('a, button, input, label, select')) {
    return;
  }

  event.currentTarget.querySelector<HTMLAnchorElement>('a[data-row-link]')?.click();
}

/** `value`, once it has stopped changing for `delayMs` (for search boxes that query per key). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}
