'use client';

import { useSyncExternalStore } from 'react';

// Below Tailwind's `sm`, where tables leave their `tableStyles.phoneHidden` columns out.
const phoneQuery = '(max-width: 639.98px)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(phoneQuery);

  media.addEventListener('change', onChange);

  return () => media.removeEventListener('change', onChange);
}

/**
 * Whether the screen is phone-sized; false on the server. For what CSS cannot switch, such as
 * the `colSpan` of a row under a table that hides columns on phones.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}
