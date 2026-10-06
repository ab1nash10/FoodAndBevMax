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

export const hospitalSchema = z.object({
  address: z.string().trim().min(1, 'Address is required.').max(500),
  area: optionalText(50),
  city: z.string().trim().min(1, 'City is required.').max(100),
  displayName: z.string().trim().min(1, 'Display name is required.').max(255),
  invoicePrefix: optionalText(50),
  ipAddress: optionalText(100),
  isActive: z.boolean(),
  latitude: optionalText(50),
  locationCode: z.string().trim().min(1, 'Location code is required.').max(50),
  longitude: optionalText(50),
  onlinePaymentOption: z.enum(['NONE', 'PAYU', 'RAZORPAY']),
  postalCode: postalCodeSchema,
  state: z.string().trim().min(1, 'State is required.').max(100),
  title: z.string().trim().min(1, 'Title is required.').max(255),
  visitingCardAddress: optionalText(500),
});

export const locationSchema = z.object({
  address: optionalText(255),
  area: optionalText(100),
  building: optionalText(100),
  floor: optionalText(50),
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  locationName: z.string().trim().min(1, 'Location name is required.').max(150),
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
  gstNumber: optionalText(50),
  hospitalId: z.string().uuid('Select a location.'),
  ifscCode: optionalText(50),
  isAtTableDiningEnabled: z.boolean(),
  isDeliveryEnabled: z.boolean(),
  isHomeDeliveryEnabled: z.boolean(),
  isInCarDiningEnabled: z.boolean(),
  isInRoomDiningEnabled: z.boolean(),
  isInventoryEnabled: z.boolean(),
  isOffline: z.boolean(),
  isOnlineOrdersEnabled: z.boolean(),
  isOpen24x7: z.boolean(),
  isPosOrdersEnabled: z.boolean(),
  isRegisteredInGst: z.boolean(),
  isTakeawayEnabled: z.boolean(),
  isVegOnly: z.boolean(),
  isActive: z.boolean(),
  legalName: optionalText(255),
  mobile: optionalText(30),
  panNumber: optionalText(50),
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
