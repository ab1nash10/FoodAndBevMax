import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDeviceDraft, writeDeviceDraft } from '@/lib/use-device-draft';
import type { LocationStockLevel } from '@aahar/api-client';
import {
  readTransferPrefill,
  sendFromStoreHref,
  suggestedTransferQty,
  transferPrefillHref,
} from './transfer-prefill';

describe('transfer prefill', () => {
  it('round-trips through the URL and drops bad or repeated lines', () => {
    const href = transferPrefillHref({
      hospitalId: 'h1',
      items: [
        { itemId: 'a', qty: 4 },
        { itemId: 'b', qty: 0.5 },
      ],
      storeId: 's1',
    });

    expect(readTransferPrefill(new URL(href, 'http://x').searchParams)).toEqual({
      hospitalId: 'h1',
      items: [
        { itemId: 'a', qty: 4 },
        { itemId: 'b', qty: 0.5 },
      ],
      storeId: 's1',
    });
    expect(readTransferPrefill(new URLSearchParams('from=s1&items=a:2,a:3,b:x,c:-1,:4,d'))).toEqual(
      { hospitalId: '', items: [{ itemId: 'a', qty: 2 }], storeId: 's1' },
    );
    expect(readTransferPrefill(new URLSearchParams('items=a:2'))).toBeNull();
    expect(readTransferPrefill(new URLSearchParams('to=KITCHEN:k1&items=a:2'))).toBeNull();
  });

  it('carries a destination without a source store, for the person to pick the store', () => {
    const href = sendFromStoreHref(
      'COUNTER',
      [
        { averageDailyIssue: 2, hospitalId: 'h1', itemId: 'a', locationId: 'c1', onHand: 1 },
        { averageDailyIssue: 0.1, hospitalId: 'h1', itemId: 'b', locationId: 'c1', onHand: 0 },
      ] as LocationStockLevel[],
      3,
    );

    expect(readTransferPrefill(new URL(href, 'http://x').searchParams)).toEqual({
      destination: { id: 'c1', type: 'COUNTER' },
      hospitalId: 'h1',
      items: [
        { itemId: 'a', qty: 5 },
        { itemId: 'b', qty: 1 },
      ],
    });
  });

  it('suggests enough for the cover days less what is on hand, at least one', () => {
    expect(suggestedTransferQty({ averageDailyIssue: 2.2, onHand: 1 }, 3)).toBe(6);
    expect(suggestedTransferQty({ averageDailyIssue: 1, onHand: 2.9 }, 3)).toBe(1);
    expect(suggestedTransferQty({ averageDailyIssue: 0, onHand: 0 }, 3)).toBe(1);
  });
});

describe('device draft storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stores the form flat with its time, and survives refused storage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });

    writeDeviceDraft('k', { lines: [1], savedAt: '2026-10-21T10:00:00.000Z' });
    expect(JSON.parse(store.get('k')!)).toEqual({
      lines: [1],
      savedAt: '2026-10-21T10:00:00.000Z',
    });
    expect(readDeviceDraft('k')).toEqual({ lines: [1], savedAt: '2026-10-21T10:00:00.000Z' });
    writeDeviceDraft('k', null);
    expect(readDeviceDraft('k')).toBeNull();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(readDeviceDraft('k')).toBeNull();
    expect(() => writeDeviceDraft('k', { savedAt: 'now' })).not.toThrow();
  });
});
