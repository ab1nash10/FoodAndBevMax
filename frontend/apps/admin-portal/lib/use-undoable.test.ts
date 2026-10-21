import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUndoQueue } from '@/lib/use-undoable';

describe('createUndoQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const changes: string[][] = [];
    const queue = createUndoQueue(6000, (ids) => changes.push([...ids]));

    return { changes, queue };
  }

  it('sends the change only when the time is up', async () => {
    const { changes, queue } = setup();
    const commit = vi.fn(() => Promise.resolve());

    queue.schedule('a', commit);
    expect(changes.at(-1)).toEqual(['a']);
    vi.advanceTimersByTime(5999);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledOnce();
    // Shown as changed until the send settles.
    expect(changes.at(-1)).toEqual(['a']);
    await vi.runAllTimersAsync();
    expect(changes.at(-1)).toEqual([]);
  });

  it('undo drops the change unsent', () => {
    const { changes, queue } = setup();
    const commit = vi.fn(() => Promise.resolve());

    queue.schedule('a', commit);
    expect(queue.undo('a')).toBe(true);
    expect(changes.at(-1)).toEqual([]);
    vi.advanceTimersByTime(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(queue.undo('a')).toBe(false);
  });

  it('flush sends everything waiting at once, and only once', () => {
    const { queue } = setup();
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());

    queue.schedule('a', first);
    queue.schedule('b', second);
    queue.flush();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10_000);
    expect(first).toHaveBeenCalledOnce();
    // Too late to undo once sent.
    expect(queue.undo('a')).toBe(false);
  });

  it('a failed send brings the record back', async () => {
    const { changes, queue } = setup();

    queue.schedule('a', () => Promise.reject(new Error('offline')));
    queue.flush();
    await vi.runAllTimersAsync();
    expect(changes.at(-1)).toEqual([]);
  });

  it('ignores a second change to a record already waiting', () => {
    const { queue } = setup();
    const second = vi.fn(() => Promise.resolve());

    expect(queue.schedule('a', () => Promise.resolve())).toBe(true);
    expect(queue.schedule('a', second)).toBe(false);
    queue.flush();
    expect(second).not.toHaveBeenCalled();
  });
});
