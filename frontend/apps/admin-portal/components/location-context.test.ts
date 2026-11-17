import { strict as assert } from 'node:assert';
import type { HospitalSummary } from '@aahar/api-client';
import { test } from 'vitest';
import { formatGlobalLocationLabel, getLocationTitle } from './location-context';

const location = (extra: Partial<HospitalSummary>) =>
  ({
    hospitalCode: 'H01',
    hospitalName: 'Max Saket',
    id: 'h1',
    isActive: true,
    ...extra,
  }) as HospitalSummary;

test('the header label: code - title, then city, state and postal code', () => {
  assert.equal(
    formatGlobalLocationLabel(
      location({ city: 'New Delhi', locationCode: 'MSK', postalCode: '110017', state: 'Delhi' }),
    ),
    'MSK - Max Saket, New Delhi, Delhi-110017',
  );
});

// The header names a location as the Locations list does, so renaming it there renames it here;
// the display name is only the last resort.
test('the title wins over the display name; the location code over the hospital code', () => {
  assert.equal(
    formatGlobalLocationLabel(location({ displayName: 'Saket', title: 'Max Super Speciality' })),
    'H01 - Max Super Speciality',
  );
  assert.equal(
    getLocationTitle(location({ displayName: 'Saket', title: 'DDF Saket' })),
    'DDF Saket',
  );
  assert.equal(getLocationTitle(location({ displayName: 'Saket', hospitalName: '' })), 'Saket');
});

test('missing parts are left out rather than shown empty', () => {
  assert.equal(
    formatGlobalLocationLabel(location({ hospitalCode: '', state: 'Delhi' })),
    'Max Saket, Delhi',
  );
  assert.equal(
    formatGlobalLocationLabel(location({ hospitalCode: '', hospitalName: '' })),
    'Location',
  );
});
