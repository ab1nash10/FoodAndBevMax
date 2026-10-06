import { describe, expect, test } from 'vitest';
import {
  activeFilterToBoolean,
  hasRequiredText,
  nullableText,
  optionalValue,
} from '@/components/organization/shared/utils';
import { isUuid } from '@/components/organization/shared/schemas';
import {
  formatLocationOption,
  formatRestaurantLocationDisplay,
  toHospitalFormDefaults,
  toHospitalInput,
} from '@/components/organization/shared/locations';
import { type LocationDisplaySource } from '@/components/organization/shared/types';

const base: LocationDisplaySource = {
  hospitalCode: 'H01',
  hospitalName: 'Max Saket',
  id: 'b9e16d28-5c46-4d93-8365-e06ea6b58c6e',
  isActive: true,
};

describe('location labels', () => {
  test('option label: code, title, city and state-postal, code again', () => {
    expect(formatLocationOption(base)).toBe('H01 - Max Saket (H01)');
    expect(
      formatLocationOption({
        ...base,
        city: 'New Delhi',
        locationCode: 'SKT',
        postalCode: '110017',
        state: 'Delhi',
        title: 'Saket',
      }),
    ).toBe('SKT - Saket, New Delhi, Delhi-110017 (SKT)');
    expect(formatLocationOption({ ...base, state: 'Delhi' })).toBe('H01 - Max Saket, Delhi (H01)');
  });

  test('restaurant display prefers the display name and handles a missing location', () => {
    expect(formatRestaurantLocationDisplay(null)).toBe('Location not set');
    expect(formatRestaurantLocationDisplay(undefined)).toBe('Location not set');
    expect(formatRestaurantLocationDisplay(base)).toBe('H01 - Max Saket');
    expect(
      formatRestaurantLocationDisplay({
        ...base,
        city: 'Gurugram',
        displayName: 'Max Gurugram',
        postalCode: '122001',
      }),
    ).toBe('H01 - Max Gurugram, Gurugram, 122001');
  });
});

describe('form helpers', () => {
  test('text helpers', () => {
    expect(optionalValue('  x  ')).toBe('x');
    expect(optionalValue('   ')).toBeUndefined();
    expect(optionalValue(undefined)).toBeUndefined();
    expect(hasRequiredText(' a ')).toBe(true);
    expect(hasRequiredText('  ')).toBe(false);
    expect(nullableText(null)).toBe('Not set');
    expect(nullableText('')).toBe('Not set');
    expect(nullableText('Kitchen')).toBe('Kitchen');
    expect(isUuid(base.id)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  test('active filter maps to the API boolean', () => {
    expect(activeFilterToBoolean('active')).toBe(true);
    expect(activeFilterToBoolean('inactive')).toBe(false);
    expect(activeFilterToBoolean('')).toBeUndefined();
  });

  test('hospital form values map to the API input, mirroring codes and prefixes', () => {
    const defaults = toHospitalFormDefaults();
    expect(defaults).toMatchObject({ isActive: true, onlinePaymentOption: 'NONE', title: '' });
    expect(
      toHospitalInput({
        ...defaults,
        address: ' 1 Press Enclave Road ',
        area: '  ',
        city: ' New Delhi ',
        displayName: ' Max Saket ',
        invoicePrefix: ' SKT ',
        locationCode: ' SKT ',
        state: ' Delhi ',
        title: ' Saket ',
      }),
    ).toEqual({
      address: '1 Press Enclave Road',
      area: undefined,
      billPrefix: 'SKT',
      city: 'New Delhi',
      displayName: 'Max Saket',
      hospitalCode: 'SKT',
      hospitalName: 'Saket',
      invoicePrefix: 'SKT',
      ipAddress: undefined,
      isActive: true,
      latitude: undefined,
      locationCode: 'SKT',
      longitude: undefined,
      onlinePaymentOption: 'NONE',
      postalCode: undefined,
      state: 'Delhi',
      title: 'Saket',
      visitingCardAddress: undefined,
    });
  });
});
