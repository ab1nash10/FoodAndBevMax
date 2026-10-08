import { strict as assert } from 'node:assert';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { hospitalScopeStorage } from '@aahar/auth';
import { test } from 'vitest';
import {
  assertMayChangeShared,
  assertNotUsedElsewhere,
  assertUsableAt,
  sharedOrAt,
} from './location-masters';

const asLocationUser = (work: () => void) =>
  hospitalScopeStorage.run({ allowedHospitalIds: ['hospital-a'] }, work);

test('a location lists the shared records plus its own', () => {
  assert.deepEqual(sharedOrAt('hospital-a'), {
    OR: [{ hospitalId: null }, { hospitalId: 'hospital-a' }],
  });
});

test('only a user who reaches every location may change a shared record', () => {
  // A Super Admin's requests carry no allowed list.
  assert.doesNotThrow(() => assertMayChangeShared(null, 'items'));
  asLocationUser(() => {
    assert.throws(
      () => assertMayChangeShared(null, 'items'),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        error.message === 'Only a Super Admin can change items shared by every location',
    );
    assert.doesNotThrow(() => assertMayChangeShared('hospital-a', 'items'));
  });
});

test('a shared record is usable anywhere, a location one only at its location', () => {
  assert.doesNotThrow(() => assertUsableAt({ hospitalId: null }, 'hospital-b', 'item'));
  assert.doesNotThrow(() => assertUsableAt({ hospitalId: 'hospital-a' }, 'hospital-a', 'item'));
  assert.throws(
    () => assertUsableAt({ hospitalId: 'hospital-a' }, 'hospital-b', 'item'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'This item belongs to another location',
  );
  assert.throws(
    () => assertUsableAt({ hospitalId: 'hospital-a' }, null, 'category'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      /a record shared by every location/.test(error.message),
  );
});

test('a record used at other locations cannot be given to one', () => {
  assert.doesNotThrow(() => assertNotUsedElsewhere(0, 'item'));
  assert.throws(() => assertNotUsedElsewhere(2, 'item'), BadRequestException);
});
