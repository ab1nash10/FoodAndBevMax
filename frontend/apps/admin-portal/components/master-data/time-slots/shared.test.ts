import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import {
  emptyTimeSlot,
  slotHours,
  timeSlotInput,
  timeSlotSchema,
  timeSlotToFormValues,
  type TimeSlotFormValues,
} from './shared';

const slot = (extra: Partial<TimeSlotFormValues>): TimeSlotFormValues => ({
  ...emptyTimeSlot,
  endTime: '10:30',
  slotName: 'Breakfast',
  startTime: '07:00',
  ...extra,
});
const issues = (values: TimeSlotFormValues) =>
  timeSlotSchema.safeParse(values).error?.issues.map((issue) => [issue.path[0], issue.message]) ?? [];

test('a slot needs a name with a letter or number, and is saved trimmed', () => {
  assert.deepEqual(issues(slot({})), []);
  assert.equal(timeSlotSchema.parse(slot({ slotName: '  Lunch ' })).slotName, 'Lunch');
  assert.deepEqual(issues(slot({ slotName: '   ' }))[0], ['slotName', 'Slot name is required.']);
  assert.deepEqual(issues(slot({ slotName: '--' })), [
    ['slotName', 'Slot name must include at least one letter or number.'],
  ]);
});

test('times are 24-hour HH:MM and the end must be after the start', () => {
  assert.deepEqual(issues(slot({ endTime: '', startTime: '' })), [
    ['startTime', 'Enter a start time.'],
    ['endTime', 'Enter an end time.'],
  ]);
  assert.deepEqual(issues(slot({ startTime: '07:60' })), [['startTime', 'Enter a start time.']]);
  assert.deepEqual(issues(slot({ endTime: '7:30' })), [['endTime', 'Enter an end time.']]);
  assert.deepEqual(issues(slot({ endTime: '07:00' })), [['endTime', 'End must be after start.']]);
  assert.deepEqual(issues(slot({ endTime: '00:30', startTime: '22:00' })), [
    ['endTime', 'End must be after start.'],
  ]);
});

test('an all-day slot needs no times, and sends none', () => {
  const allDay = slot({ endTime: '', isAlwaysAvailable: true, startTime: '' });
  assert.deepEqual(issues(allDay), []);
  assert.deepEqual(timeSlotInput({ ...allDay, endTime: '09:00', startTime: '08:00' }), {
    endTime: undefined,
    hospitalId: null,
    isActive: true,
    isAlwaysAvailable: true,
    slotName: 'Breakfast',
    startTime: undefined,
  });
});

test('no location is every location (null), and a slot loads back into the form', () => {
  assert.deepEqual(timeSlotInput(slot({ hospitalId: 'h1', slotName: ' Tea ' })), {
    endTime: '10:30',
    hospitalId: 'h1',
    isActive: true,
    isAlwaysAvailable: false,
    slotName: 'Tea',
    startTime: '07:00',
  });
  assert.deepEqual(
    timeSlotToFormValues({
      endTime: null,
      hospitalId: null,
      isActive: false,
      isAlwaysAvailable: true,
      slotName: 'Any time',
      startTime: null,
    } as never),
    { ...emptyTimeSlot, isActive: false, isAlwaysAvailable: true, slotName: 'Any time' },
  );
});

test('slot hours read as a range, all day, or past midnight', () => {
  const hours = (startTime: string | null, endTime: string | null, isAlwaysAvailable = false) =>
    slotHours({ endTime, isAlwaysAvailable, startTime }).replace(/\s/g, ' ').toLowerCase();
  assert.equal(hours('07:00', '10:30'), '7:00 am – 10:30 am');
  assert.equal(hours('22:00', '01:00'), '10:00 pm – 1:00 am (next day)');
  assert.equal(hours('07:00', '10:30', true), 'all day');
  assert.equal(hours(null, '10:30'), 'all day');
});
