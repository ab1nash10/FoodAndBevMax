import { expect, test, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ organizationApi: {} }));

const holding = (...codes: string[]) => (code: string | string[]) =>
  (Array.isArray(code) ? code : [code]).some((one) => codes.includes(one));

test('each POS tab needs its own permission, so ?tab= cannot open one the user lacks', async () => {
  const { posTabFor } = await import('./pos-master-page');

  expect(posTabFor('payments', holding('COUNTER_VIEW'))).toBe('counters');
  expect(posTabFor('devices', holding('COUNTER_VIEW'))).toBe('counters');
  expect(posTabFor('payments', holding('POS_DEVICE_VIEW'))).toBe('devices');
  expect(posTabFor('devices', holding('PAYMENT_MACHINE_VIEW'))).toBe('payments');
  expect(posTabFor('counters', holding('POS_DEVICE_VIEW', 'COUNTER_VIEW'))).toBe('counters');
  // Importing the page pulls in its whole UI tree, which takes a few seconds in a full run.
}, 30_000);
