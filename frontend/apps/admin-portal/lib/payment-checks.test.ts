import { describe, expect, it } from 'vitest';
import { PAYMENT_WINDOW_MS, paymentCheckEvery } from './payment-checks';

describe('how often a waiting payment is checked', () => {
  it('every 5 s for its first 30 s, then every 10 s, until 3 minutes', () => {
    const checks: number[] = [0];
    for (let at = paymentCheckEvery(0); at < PAYMENT_WINDOW_MS; at += paymentCheckEvery(at)) {
      checks.push(at / 1000);
    }

    expect(checks).toEqual([
      0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170,
    ]);
    expect(PAYMENT_WINDOW_MS).toBe(3 * 60_000);
  });
});
