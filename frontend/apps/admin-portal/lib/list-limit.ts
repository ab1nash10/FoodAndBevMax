'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { setUrlParams } from './use-url-state';

/** The page sizes every list offers ("Rows" under the table). */
export const pageSizes = [10, 20, 25, 50, 100];

const storageKey = 'aahar.rows-per-page';

const offered = (value: string | null) => {
  const size = Number(value);
  return pageSizes.includes(size) ? size : null;
};

/** `?rows=` in the link, else the size last picked on this browser (any list), else `fallback`. */
export function rowsPerPage(fromUrl: string | null, remembered: string | null, fallback: number) {
  return offered(fromUrl) ?? offered(remembered) ?? fallback;
}

function remembered(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/**
 * A list's rows per page, with the setter its "Rows" picker calls. The size goes in the link
 * (`?rows=50`) and is remembered for the next list; a new size starts again at page 1.
 */
export function useListLimit(
  setPage: (page: number) => void,
  fallback = 10,
): [number, (size: number) => void] {
  const searchParams = useSearchParams();
  const limit = rowsPerPage(searchParams.get('rows'), remembered(), fallback);

  const setLimit = useCallback(
    (size: number) => {
      try {
        window.localStorage.setItem(storageKey, String(size));
      } catch {
        // Private browsing: the size holds for this link only.
      }
      setUrlParams({ rows: String(size) });
      setPage(1);
    },
    [setPage],
  );

  return [limit, setLimit];
}
