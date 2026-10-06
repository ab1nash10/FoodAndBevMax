import { expect, test, vi } from 'vitest';
import { lazyValue } from './lazy-value';

test('loads once and shares the result', async () => {
  const load = vi.fn(() => Promise.resolve(42));
  const value = lazyValue(load);
  value.warm();
  await expect(value.get()).resolves.toBe(42);
  await expect(value.get()).resolves.toBe(42);
  expect(load).toHaveBeenCalledTimes(1);
});

test('a failed load is retried on the next get, and warm never throws', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ok');
  const value = lazyValue(load);
  value.warm();
  await expect(value.get()).rejects.toThrow('offline');
  await expect(value.get()).resolves.toBe('ok');
  expect(load).toHaveBeenCalledTimes(2);
});
