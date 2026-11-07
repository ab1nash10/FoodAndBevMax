import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, test } from 'vitest';
import { CreateTimeSlotDto } from './create-time-slot.dto';

const failing = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateTimeSlotDto, { slotName: 'Breakfast', ...body })).map(
    (error) => error.property,
  );

describe('time slot fields', () => {
  test('a timed slot needs a start and an end in 24-hour HH:mm', () => {
    expect(failing({ endTime: '10:30', startTime: '07:00' })).toEqual([]);
    expect(failing({})).toEqual(['startTime', 'endTime']);
    expect(failing({ endTime: '24:00', startTime: '7:00' })).toEqual(['startTime', 'endTime']);
  });

  test('an always-available slot needs no times', () => {
    expect(failing({ isAlwaysAvailable: true })).toEqual([]);
  });

  test('the name is saved in Title Case', () => {
    expect(
      plainToInstance(CreateTimeSlotDto, { slotName: '  late   night snacks ' }).slotName,
    ).toBe('Late Night Snacks');
  });
});
