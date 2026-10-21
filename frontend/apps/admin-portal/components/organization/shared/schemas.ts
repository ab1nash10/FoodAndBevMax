'use client';

import { z } from 'zod';

export const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength, `Use ${maxLength} characters or fewer.`);

export const optionalEmail = z
  .string()
  .trim()
  .max(255, 'Use 255 characters or fewer.')
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email address.',
  });

export const postalCodeSchema = z
  .string()
  .trim()
  .max(6, 'Postal code must be 6 digits.')
  .refine((value) => !value || /^\d{6}$/.test(value), {
    message: 'Postal code must be 6 digits.',
  });

/** GSTIN: state code, PAN, entity number, the letter Z, check character. The server checks too. */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Blank, or text matching the pattern; letters in either case (the server stores capitals). */
const optionalPattern = (maxLength: number, pattern: RegExp, message: string) =>
  optionalText(maxLength).refine((value) => !value || pattern.test(value.toUpperCase()), {
    message,
  });

const optionalIpAddress = optionalText(100).refine(
  (value) => !value || z.union([z.ipv4(), z.ipv6()]).safeParse(value).success,
  { message: 'Enter a valid IP address.' },
);

export const hospitalSchema = z.object({
  address: optionalText(500),
  area: optionalText(50),
  city: z.string().trim().min(1, 'City is required.').max(100),
  /** Blank: the title is shown. */
  displayName: optionalText(255),
  invoicePrefix: optionalText(50),
  ipAddress: optionalIpAddress,
  isActive: z.boolean(),
  latitude: optionalText(50),
  /** Empty: not linked to an entity. */
  legalEntityId: z.string(),
  locationCode: z.string().trim().min(1, 'Location code is required.').max(50),
  longitude: optionalText(50),
  onlinePaymentOption: z.enum(['NONE', 'PAYU', 'RAZORPAY']),
  postalCode: postalCodeSchema,
  state: z.string().trim().min(1, 'State is required.').max(100),
  title: z.string().trim().min(1, 'Title is required.').max(255),
  visitingCardAddress: optionalText(500),
});

export const storeSchema = z.object({
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  storeName: z.string().trim().min(1, 'Store name is required.').max(150),
});

export const kitchenSchema = z.object({
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  kitchenName: z.string().trim().min(1, 'Kitchen name is required.').max(150),
});

export const restaurantSchema = z.object({
  accountNumber: optionalText(100),
  address: optionalText(255),
  bankNameBranch: optionalText(255),
  email: optionalEmail,
  fssaiNumbers: optionalText(500),
  gstNumber: optionalPattern(50, GSTIN_PATTERN, 'Enter a valid 15-character GST number.'),
  hospitalId: z.string().uuid('Select a location.'),
  ifscCode: optionalPattern(50, /^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC code.'),
  isAtTableDiningEnabled: z.boolean(),
  isDeliveryEnabled: z.boolean(),
  isHomeDeliveryEnabled: z.boolean(),
  isInCarDiningEnabled: z.boolean(),
  isInRoomDiningEnabled: z.boolean(),
  isInventoryEnabled: z.boolean(),
  isIhcOnly: z.boolean(),
  isOffline: z.boolean(),
  isOnlineOrdersEnabled: z.boolean(),
  isOpen24x7: z.boolean(),
  isPosOrdersEnabled: z.boolean(),
  isRegisteredInGst: z.boolean(),
  isTakeawayEnabled: z.boolean(),
  isVegOnly: z.boolean(),
  isActive: z.boolean(),
  /** Empty: not linked to an entity. */
  legalEntityId: z.string(),
  legalName: optionalText(255),
  mobile: optionalText(30).regex(/^$|^\d{10}$/, 'Enter a valid 10 digit mobile number.'),
  panNumber: optionalPattern(50, /^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid 10-character PAN.'),
  restaurantName: z.string().trim().min(1, 'Restaurant name is required.').max(150),
  sodexoMid: optionalText(100),
  sodexoTid: optionalText(100),
  sunBu: optionalText(100),
  sunT1: optionalText(100),
  sunT2: optionalText(100),
  unitNameForQr: optionalText(255),
  upiId: optionalText(255),
});

export function isUuid(value: string | undefined): boolean {
  return z.string().uuid().safeParse(value).success;
}
