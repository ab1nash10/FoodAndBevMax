'use client';

import { useEffect, useRef, useState } from 'react';

/** The form's own fields plus when it was kept, flat, as the receive page has always stored it. */
type StoredDraft<T extends object> = T & { savedAt: string };

export function readDeviceDraft<T extends object>(key: string): StoredDraft<T> | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as StoredDraft<T> | null;

    return parsed && typeof parsed === 'object' && parsed.savedAt ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDeviceDraft<T extends object>(
  key: string,
  draft: StoredDraft<T> | null,
): void {
  try {
    if (draft) window.localStorage.setItem(key, JSON.stringify(draft));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage may be refused; the form then lives only on this screen.
  }
}

/**
 * A half-finished form kept on this device. Once per `key` (null while it is not known yet) the
 * saved one is handed to `onRestore`, which returns false when it leaves it unused; after that
 * `value` is written a moment after each change while `keep` is true. `clear` forgets it.
 */
export function useDeviceDraft<T extends object>(
  key: string | null,
  value: T,
  { keep, onRestore }: { keep: boolean; onRestore: (draft: T) => boolean },
): { clear: () => void; savedAt: Date | null } {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const restoredKey = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const restore = useRef(onRestore);
  restore.current = onRestore;
  // Compared as text: a form's watched values are a new object on every render.
  const json = JSON.stringify(value);

  useEffect(() => {
    if (!key || restoredKey.current === key) return;
    restoredKey.current = key;
    const draft = readDeviceDraft<T>(key);
    const used = draft ? restore.current(draft) : false;

    setSavedAt(draft && used ? new Date(draft.savedAt) : null);
  }, [key]);

  // Keep the form as it is typed, so a refresh or a dead battery loses nothing.
  useEffect(() => {
    if (!key || restoredKey.current !== key || !keep) return undefined;
    timer.current = window.setTimeout(() => {
      const at = new Date();

      writeDeviceDraft(key, { ...(JSON.parse(json) as T), savedAt: at.toISOString() });
      setSavedAt(at);
    }, 800);

    return () => window.clearTimeout(timer.current);
  }, [json, keep, key]);

  return {
    clear: () => {
      // An edit made just before saving must not write the draft back afterwards.
      window.clearTimeout(timer.current);
      if (key) writeDeviceDraft(key, null);
      setSavedAt(null);
    },
    savedAt,
  };
}
