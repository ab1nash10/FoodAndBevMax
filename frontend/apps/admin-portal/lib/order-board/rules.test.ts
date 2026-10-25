import { describe, expect, test } from 'vitest';
import { boardView, fit, minutesSince, minutesUntil, type BoardOrder } from './rules';

const now = Date.parse('2026-10-15T07:42:00Z');
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const inMinutes = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
const ready = (orderNumber: string, minutes: number): BoardOrder => ({
  itemCount: 1,
  orderNumber,
  readyAt: ago(minutes),
  status: 'READY',
});
const preparing = (orderNumber: string, eta?: number): BoardOrder => ({
  estimatedReadyAt: eta === undefined ? undefined : inMinutes(eta),
  itemCount: 1,
  orderNumber,
  status: 'PREPARING',
});

describe('board rules', () => {
  test('the newest ready order goes in the banner, the rest newest first', () => {
    const view = boardView([ready('A 1', 5), ready('A 2', 1), ready('A 3', 3)], now);
    expect(view.nowReady?.orderNumber).toBe('A 2');
    expect(view.ready.map((order) => order.orderNumber)).toEqual(['A 3', 'A 1']);
    expect(view.readyTotal).toBe(3);
  });

  test('collect soon from 10 minutes ready', () => {
    const view = boardView([ready('A 1', 0), ready('A 2', 9), ready('A 3', 10)], now);
    expect(view.ready.map((order) => [order.readyMinutes, order.collectSoon])).toEqual([
      [9, false],
      [10, true],
    ]);
  });

  test('preparing soonest first; no estimate goes last', () => {
    const view = boardView([preparing('C 1'), preparing('C 2', 8), preparing('C 3', 2)], now);
    expect(view.preparing.map((order) => [order.orderNumber, order.etaMinutes])).toEqual([
      ['C 3', 2],
      ['C 2', 8],
      ['C 1', 1],
    ]);
  });

  test('overflow: what fits, then "+N more" in the last place', () => {
    expect(fit([1, 2, 3], 3)).toEqual({ more: 0, shown: [1, 2, 3] });
    expect(fit([1, 2, 3, 4, 5], 3)).toEqual({ more: 3, shown: [1, 2] });
    const many = Array.from({ length: 12 }, (_, index) => preparing(`C ${index}`, index + 1));
    const view = boardView(many, now);
    expect(view.preparing).toHaveLength(8);
    expect(view.preparingMore).toBe(4);
    const readyMany = Array.from({ length: 11 }, (_, index) => ready(`A ${index}`, index));
    // One in the banner, ten left for eight places: seven tiles and "+3 more".
    expect(boardView(readyMany, now)).toMatchObject({ readyMore: 3, readyTotal: 11 });
    const readyFew = Array.from({ length: 9 }, (_, index) => ready(`B ${index}`, index));
    // Eight after the banner fill the eight places exactly: no "+N more".
    expect(boardView(readyFew, now)).toMatchObject({ readyMore: 0, readyTotal: 9 });
  });

  test('minutes follow the given clock (the server), not the machine', () => {
    expect(minutesSince(ago(2.9), now)).toBe(2);
    expect(minutesSince(inMinutes(1), now)).toBe(0);
    expect(minutesUntil(inMinutes(3.2), now)).toBe(4);
    expect(minutesUntil(ago(5), now)).toBe(1);
    expect(boardView([], now)).toMatchObject({ nowReady: null, preparingTotal: 0, readyTotal: 0 });
  });
});
