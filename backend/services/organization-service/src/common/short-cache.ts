/**
 * Answers repeated identical reads from memory for `ttlMs`: callers asking the same key while it
 * is fresh share one load (also one in flight). A failed load is dropped, so the next caller
 * retries. ponytail: per process and never evicted beyond expiry; keys must stay few (one per
 * scope and filter set), and a second pod keeps its own copy.
 */
export class ShortCache {
  private readonly entries = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(private readonly ttlMs: number) {}

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (entry && now - entry.at < this.ttlMs) {
      return entry.value as Promise<T>;
    }

    for (const [stale, { at }] of this.entries) {
      if (now - at >= this.ttlMs) this.entries.delete(stale);
    }

    const value = load();
    this.entries.set(key, { at: now, value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });

    return value;
  }
}
