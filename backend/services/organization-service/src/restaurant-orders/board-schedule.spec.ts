import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { boardSchedule, type OpeningRules } from './board-schedule';

const open: OpeningRules = {
  closingTime: null,
  isActive: true,
  offline: false,
  open24x7: false,
  openingTime: null,
};
const slots = [
  { endTime: '10:30', slotName: 'Breakfast', startTime: '07:00' },
  { endTime: '15:00', slotName: 'Lunch', startTime: '12:00' },
  { endTime: '01:00', slotName: 'Late night', startTime: '22:00' },
  { endTime: null, slotName: 'All Time', startTime: null },
];
// 13:12 and 11:00 in India (UTC+05:30).
const lunchTime = new Date('2026-10-15T07:42:00Z');
const betweenSlots = new Date('2026-10-15T05:30:00Z');

test('inside a slot: open, with its name and end', () => {
  assert.deepEqual(boardSchedule(open, slots, lunchTime), {
    isOpen: true,
    slotEndsAt: '2026-10-15T09:30:00.000Z',
    slotName: 'Lunch',
  });
});

test('between slots: closed, opening at the next slot', () => {
  assert.deepEqual(boardSchedule(open, slots, betweenSlots), {
    isOpen: false,
    opensAt: '2026-10-15T06:30:00.000Z',
  });
});

test('a slot that runs past midnight ends the next day', () => {
  const half = new Date('2026-10-15T17:30:00Z'); // 23:00
  assert.equal(boardSchedule(open, slots, half).slotEndsAt, '2026-10-15T19:30:00.000Z');
  const after = new Date('2026-10-15T19:00:00Z'); // 00:30 on the 16th
  assert.equal(boardSchedule(open, slots, after).slotName, 'Late night');
});

test('no timed slots: open whenever the restaurant is', () => {
  assert.deepEqual(boardSchedule(open, [], betweenSlots), { isOpen: true });
});

test('opening hours and the restaurant switches close it', () => {
  const hours = { ...open, closingTime: '16:00', openingTime: '08:00' };
  assert.equal(boardSchedule(hours, [], lunchTime).isOpen, true);
  const evening = new Date('2026-10-15T12:30:00Z'); // 18:00
  assert.deepEqual(boardSchedule(hours, [], evening), {
    isOpen: false,
    opensAt: '2026-10-16T02:30:00.000Z',
  });
  assert.equal(boardSchedule({ ...hours, open24x7: true }, [], evening).isOpen, true);
  assert.deepEqual(boardSchedule({ ...open, offline: true }, slots, lunchTime), {
    isOpen: false,
    slotEndsAt: '2026-10-15T09:30:00.000Z',
    slotName: 'Lunch',
  });
  assert.equal(boardSchedule({ ...open, isActive: false }, [], lunchTime).isOpen, false);
});
