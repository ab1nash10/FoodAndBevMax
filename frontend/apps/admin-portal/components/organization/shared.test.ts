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
import {
  allowsOnlineOrdering,
  getRestaurantStatusBadges,
  restaurantFormDefaultValues,
  toRestaurantInput,
} from '@/components/organization/shared/restaurants';
import { type LocationDisplaySource } from '@/components/organization/shared/types';
import type { Restaurant } from '@aahar/api-client';

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
      legalEntityId: null,
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

describe('restaurant options', () => {
  const restaurant = (offline: boolean, onlineOrders: boolean, isActive = !offline) =>
    ({
      isActive,
      isOffline: offline,
      isOnlineOrdersEnabled: onlineOrders,
      offline,
      onlineOrderingEnabled: onlineOrders,
      onlineOrders,
    }) as unknown as Restaurant;

  test('online ordering is the Online Orders (QR) option, and only while the restaurant is open', () => {
    expect(allowsOnlineOrdering(restaurant(false, true))).toBe(true);
    expect(allowsOnlineOrdering(restaurant(false, false))).toBe(false);
    // Inactive and Offline (as BLK was): no online orders, whatever the option says.
    expect(allowsOnlineOrdering(restaurant(true, true))).toBe(false);
    expect(allowsOnlineOrdering(restaurant(false, true, false))).toBe(false);
    expect(allowsOnlineOrdering(restaurant(true, true, true))).toBe(false);
  });

  test('the status badges follow Online Orders and show Offline', () => {
    const labels = (r: Restaurant) => getRestaurantStatusBadges(r).map((badge) => badge.label);

    expect(labels(restaurant(false, true))).toEqual(['Online Orders']);
    expect(labels(restaurant(false, false))).toEqual([]);
    expect(labels(restaurant(true, false))).toEqual(['Offline']);
    expect(labels(restaurant(true, true))).toEqual(['Offline']);
  });

  test('Offline is saved as the opposite of Active, repairing a record with both set', () => {
    const save = (isActive: boolean, isOffline: boolean) =>
      toRestaurantInput({ ...restaurantFormDefaultValues, isActive, isOffline }).isOffline;

    expect(save(true, true)).toBe(false);
    expect(save(false, false)).toBe(true);
    expect(save(true, false)).toBe(false);
  });

  test('IHC only and the entity reach the API input', () => {
    const input = toRestaurantInput({
      ...restaurantFormDefaultValues,
      isIhcOnly: true,
      legalEntityId: 'entity-1',
    });

    expect(input).toMatchObject({ isIhcOnly: true, legalEntityId: 'entity-1' });
    expect(toRestaurantInput(restaurantFormDefaultValues)).toMatchObject({
      isIhcOnly: false,
      legalEntityId: null,
    });
  });
});
