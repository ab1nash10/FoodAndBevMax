'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/toast-provider';

/** How long the Undo toast stays before the change is sent. */
export const undoDelayMs = 6000;

/**
 * Changes waiting to be sent, by record id. Each is sent when its time is up, or at once by
 * `flush`; `undo` drops it unsent. `onChange` gets the ids to show as changed: those waiting and
 * those being sent, until the send settles.
 */
export function createUndoQueue(delayMs: number, onChange: (ids: ReadonlySet<string>) => void) {
  const waiting = new Map<
    string,
    { commit: () => Promise<unknown>; timer: ReturnType<typeof setTimeout> }
  >();
  const changed = new Set<string>();

  function settle(id: string) {
    changed.delete(id);
    onChange(new Set(changed));
  }

  function send(id: string) {
    const entry = waiting.get(id);

    if (!entry) return;
    waiting.delete(id);
    clearTimeout(entry.timer);
    // Either way the row goes back to the list's own data: changed if it was saved, as it was if not.
    void entry
      .commit()
      .catch(() => undefined)
      .finally(() => settle(id));
  }

  return {
    flush: () => [...waiting.keys()].forEach(send),
    /** False when the record already has a change on its way. */
    schedule(id: string, commit: () => Promise<unknown>): boolean {
      if (changed.has(id)) return false;
      changed.add(id);
      waiting.set(id, { commit, timer: setTimeout(() => send(id), delayMs) });
      onChange(new Set(changed));
      return true;
    },
    /** False when nothing was waiting (already sent, or never scheduled). */
    undo(id: string): boolean {
      const entry = waiting.get(id);

      if (!entry) return false;
      waiting.delete(id);
      clearTimeout(entry.timer);
      settle(id);
      return true;
    },
  };
}

/**
 * Delete or deactivate without "Are you sure?": the row shows the change at once with an Undo
 * toast, and the change is only sent when the toast runs out. Leaving the page or hiding the tab
 * sends what is waiting at once, so it is not lost (a tab closed mid-wait relies on the browser
 * finishing that last request). `commit` is the record's own mutation, which shows any error;
 * the row then comes back.
 */
export function useUndoable() {
  const queryClient = useQueryClient();
  const { dismissToast, showToast } = useToast();
  const [changedIds, setChangedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [queue] = useState(() => createUndoQueue(undoDelayMs, setChangedIds));
  const toastIds = useRef(new Map<string, string>());

  useEffect(() => {
    const sendOnHide = () => {
      if (document.visibilityState === 'hidden') queue.flush();
    };

    document.addEventListener('visibilitychange', sendOnHide);
    return () => {
      document.removeEventListener('visibilitychange', sendOnHide);
      queue.flush();
    };
  }, [queue]);

  const undo = useCallback(
    (id: string) => {
      if (!queue.undo(id)) return false;
      dismissToast(toastIds.current.get(id) ?? '');
      return true;
    },
    [dismissToast, queue],
  );

  const schedule = useCallback(
    ({
      commit,
      description,
      id,
      title,
    }: {
      commit: () => Promise<unknown>;
      description?: string;
      id: string;
      title: string;
    }) => {
      const scheduled = queue.schedule(id, async () => {
        dismissToast(toastIds.current.get(id) ?? '');
        await commit();
        // Show the change until the lists the commit invalidated are back, so the row does not
        // flash back for a moment.
        await queryClient.refetchQueries(
          { predicate: (query) => query.state.isInvalidated, type: 'active' },
          { cancelRefetch: false },
        );
      });

      if (scheduled) {
        toastIds.current.set(
          id,
          showToast({
            action: { label: 'Undo', onClick: () => undo(id) },
            description,
            duration: undoDelayMs,
            title,
            variant: 'success',
          }),
        );
      }
    },
    [dismissToast, queryClient, queue, showToast, undo],
  );

  return { isChanged: (id: string) => changedIds.has(id), schedule, undo };
}
