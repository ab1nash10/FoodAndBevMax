import { strict as assert } from 'node:assert';
import type { HospitalSummary } from '@aahar/api-client';
import { test } from 'vitest';
import { formatGlobalLocationLabel } from './location-context';

const location = (extra: Partial<HospitalSummary>) =>
  ({ hospitalCode: 'H01', hospitalName: 'Max Saket', id: 'h1', isActive: true, ...extra }) as HospitalSummary;

test('the header label: code - title, then city, state and postal code', () => {
  assert.equal(
    formatGlobalLocationLabel(
      location({ city: 'New Delhi', locationCode: 'MSK', postalCode: '110017', state: 'Delhi' }),
    ),
    'MSK - Max Saket, New Delhi, Delhi-110017',
  );
});

test('the display name wins over the title and name; the location code over the hospital code', () => {
  assert.equal(
    formatGlobalLocationLabel(location({ displayName: 'Saket', title: 'Max Super Speciality' })),
    'H01 - Saket',
  );
  assert.equal(formatGlobalLocationLabel(location({ title: 'Max Super Speciality' })), 'H01 - Max Super Speciality');
});

test('missing parts are left out rather than shown empty', () => {
  assert.equal(formatGlobalLocationLabel(location({ hospitalCode: '', state: 'Delhi' })), 'Max Saket, Delhi');
  assert.equal(formatGlobalLocationLabel(location({ hospitalCode: '', hospitalName: '' })), 'Location');
});
