import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { z } from 'zod';
import { hospitalSchema, optionalEmail, postalCodeSchema, restaurantSchema } from './schemas';
import { applyValidationErrors } from './utils';

const hospitalId = 'b9e16d28-5c46-4d93-8365-e06ea6b58c6e';
const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;
const restaurant = restaurantSchema.parse({
  accountNumber: '',
  address: '',
  bankNameBranch: '',
  email: '',
  fssaiNumbers: '',
  gstNumber: '',
  hospitalId,
  ifscCode: '',
  isActive: true,
  isAtTableDiningEnabled: false,
  isDeliveryEnabled: false,
  isHomeDeliveryEnabled: false,
  isIhcOnly: false,
  isInCarDiningEnabled: false,
  isInRoomDiningEnabled: false,
  isInventoryEnabled: true,
  isOffline: false,
  isOnlineOrdersEnabled: false,
  isOpen24x7: false,
  isPosOrdersEnabled: true,
  isRegisteredInGst: true,
  isTakeawayEnabled: true,
  isVegOnly: false,
  legalEntityId: '',
  legalName: '',
  mobile: '',
  panNumber: '',
  restaurantName: 'Cafe',
  sodexoMid: '',
  sodexoTid: '',
  sunBu: '',
  sunT1: '',
  sunT2: '',
  unitNameForQr: '',
  upiId: '',
});
/** The message for one field of a restaurant, or undefined when it passes. */
const restaurantError = (field: string, value: unknown) =>
  restaurantSchema.safeParse({ ...restaurant, [field]: value }).error?.issues[0]?.message;

test('a restaurant with only the required fields passes; blanks stay blank', () => {
  assert.equal(restaurant.gstNumber, '');
  assert.equal(restaurantError('restaurantName', '  '), 'Restaurant name is required.');
  assert.equal(restaurantError('hospitalId', ''), 'Select a location.');
});

test('GSTIN, PAN and IFSC follow their formats, in either case', () => {
  assert.equal(restaurantError('gstNumber', '07AAACM1234A1Z5'), undefined);
  assert.equal(restaurantError('gstNumber', '07aaacm1234a1z5'), undefined);
  for (const gst of ['07AAACM1234A1X5', '7AAACM1234A1Z5', '07AAACM1234A0Z5']) {
    assert.equal(restaurantError('gstNumber', gst), 'Enter a valid 15-character GST number.', gst);
  }
  assert.equal(restaurantError('panNumber', 'aaacm1234a'), undefined);
  assert.equal(restaurantError('panNumber', 'AAACM12345'), 'Enter a valid 10-character PAN.');
  assert.equal(restaurantError('ifscCode', 'HDFC0001234'), undefined);
  assert.equal(restaurantError('ifscCode', 'HDFC1001234'), 'Enter a valid 11-character IFSC code.');
});

test('restaurant mobile is blank or 10 digits; email is blank or an address', () => {
  assert.equal(restaurantError('mobile', '9876543210'), undefined);
  assert.equal(restaurantError('mobile', '98765 43210'), 'Enter a valid 10 digit mobile number.');
  assert.equal(restaurantError('email', ' cafe@max.in '), undefined);
  assert.equal(restaurantError('email', 'cafe@'), 'Enter a valid email address.');
  assert.equal(ok(optionalEmail, ''), true);
});

test('a postal code is blank or exactly six digits', () => {
  assert.equal(ok(postalCodeSchema, ''), true);
  assert.equal(ok(postalCodeSchema, ' 110017 '), true);
  assert.equal(ok(postalCodeSchema, '11001'), false);
  assert.equal(ok(postalCodeSchema, '11001A'), false);
});

test('a location needs title, code, city and state; its IP may be v4, v6 or blank', () => {
  const location = {
    address: '',
    area: '',
    city: 'New Delhi',
    displayName: '',
    invoicePrefix: '',
    ipAddress: '',
    isActive: true,
    latitude: '',
    legalEntityId: '',
    locationCode: 'MSK',
    longitude: '',
    onlinePaymentOption: 'NONE',
    payuClientId: '',
    payuClientSecret: '',
    payuMerchantId: '',
    postalCode: '110017',
    razorpayKeyId: '',
    razorpayKeySecret: '',
    state: 'Delhi',
    title: 'Max Saket',
    visitingCardAddress: '',
  };
  const error = (field: string, value: unknown) =>
    hospitalSchema.safeParse({ ...location, [field]: value }).error?.issues[0]?.message;
  assert.equal(error('title', 'Max Saket'), undefined);
  assert.equal(error('title', ''), 'Title is required.');
  assert.equal(error('locationCode', ' '), 'Location code is required.');
  assert.equal(error('ipAddress', '10.65.1.44'), undefined);
  assert.equal(error('ipAddress', '::1'), undefined);
  assert.equal(error('ipAddress', '10.65.1.300'), 'Enter a valid IP address.');
  assert.ok(error('onlinePaymentOption', 'PAYTM'));
});

test('a field with several problems shows the first, so a blank name says it is required', () => {
  const shown: Record<string, string | undefined> = {};
  const form = {
    clearErrors: () => {},
    setError: (name: string, error: { message?: string }) => (shown[name] = error.message),
  } as unknown as Parameters<typeof applyValidationErrors>[0];
  const name = z.string().trim().min(1, 'Name is required.').regex(/[a-z]/i, 'Name needs a letter.');

  applyValidationErrors(form, z.object({ name }).safeParse({ name: ' ' }).error!);
  assert.deepEqual(shown, { name: 'Name is required.' });
});
