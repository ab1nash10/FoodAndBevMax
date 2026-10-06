/**
 * A value from a module loaded on first use, e.g. a form's zod schema that only a save needs.
 * `warm()` starts loading without waiting, so it is there by the time someone saves; a failed
 * load is not kept, so the next `get()` tries again.
 */
export function lazyValue<T>(load: () => Promise<T>): { get: () => Promise<T>; warm: () => void } {
  let pending: Promise<T> | undefined;

  const get = () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });

    return pending;
  };

  return { get, warm: () => void get().catch(() => undefined) };
}
