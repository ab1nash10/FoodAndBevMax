import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, test } from 'vitest';
import { CreatePosDeviceDto } from './create-pos-device.dto';
import { UpdatePosDeviceDto } from './update-pos-device.dto';

const base = { code: 'POS001', hospitalId: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80', name: 'POS' };
const hostNameErrors = (hostName: unknown) =>
  validateSync(plainToInstance(CreatePosDeviceDto, { ...base, hostName })).filter(
    (error) => error.property === 'hostName',
  );

describe('POS device host name', () => {
  test.each([
    'test1',
    'MAX-LKO-POS-01',
    'DESKTOP-4F7K2QX',
    'pos01.max.local',
    '10.65.1.44',
    'a',
    'x'.repeat(63),
    `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`, // 253
    '', // clears a saved one
  ])('accepts %j', (hostName) => {
    expect(hostNameErrors(hostName)).toEqual([]);
  });

  test.each([
    ['a space', 'POS 01'],
    ['an underscore', '6th_Floor_Counter'],
    ['a leading hyphen', '-pos01'],
    ['a trailing hyphen', 'pos01-'],
    ['a part ending in a hyphen', 'pos-.max.local'],
    ['an empty part', 'pos01..local'],
    ['a leading dot', '.pos01'],
    ['a trailing dot', 'pos01.'],
    ['a part over 63 characters', 'x'.repeat(64)],
    [
      'over 253 characters',
      `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,
    ],
    ['other punctuation', 'pos#01'],
    ['a URL', 'http://pos01'],
    ['a port', 'pos01:8080'],
    ['non-ASCII letters', 'pós01'],
  ])('refuses %s', (_label, hostName) => {
    expect(hostNameErrors(hostName)).not.toEqual([]);
  });

  test('says what a host name may contain', () => {
    expect(Object.values(hostNameErrors('POS 01')[0]?.constraints ?? {})).toContain(
      'Enter a valid host name: letters, numbers and hyphens, with dots between parts (e.g. MAX-LKO-POS-01).',
    );
  });

  test('an update is checked the same way', () => {
    const errors = validateSync(plainToInstance(UpdatePosDeviceDto, { hostName: 'bad host' }));

    expect(errors.map((error) => error.property)).toEqual(['hostName']);
  });
});
