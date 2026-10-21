'use client';

import type { Restaurant, RestaurantInput } from '@aahar/api-client';
import { portalApi } from '@/lib/api';
import type {
  RestaurantFormValues,
  RestaurantOptionBadge,
} from '@/components/organization/shared/types';
import { optionalValue } from '@/components/organization/shared/utils';

const restaurantImageMaxSizeBytes = 5 * 1024 * 1024;

const restaurantImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

/** Active and not Offline: the restaurant is open for any orders. */
export function isRestaurantOpen(restaurant: Restaurant): boolean {
  return restaurant.isActive && !(restaurant.isOffline || restaurant.offline);
}

/**
 * Whether food can be ordered online (by QR) right now: the Online Orders option, but only
 * while the restaurant is open. The option itself is kept while it is closed, so reactivating
 * the restaurant brings online ordering back as it was.
 */
export function allowsOnlineOrdering(restaurant: Restaurant): boolean {
  return (
    isRestaurantOpen(restaurant) && (restaurant.isOnlineOrdersEnabled || restaurant.onlineOrders)
  );
}

/**
 * What the restaurant offers, for the list's Restaurant Status column. Online/Offline and
 * Active/Inactive (Restaurant Availability) have their own columns, so they are not repeated.
 */
export function getRestaurantStatusBadges(restaurant: Restaurant): RestaurantOptionBadge[] {
  const enabledOptions: Array<RestaurantOptionBadge & { enabled: boolean }> = [
    {
      enabled: restaurant.isOpen24x7 || restaurant.open24x7,
      label: 'Open 24x7',
      variant: 'neutral',
    },
    {
      enabled:
        restaurant.isInRoomDiningEnabled ||
        restaurant.inRoomDining ||
        restaurant.inRoomDiningEnabled,
      label: 'In Room Dining',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isPosOrdersEnabled || restaurant.posOrders,
      label: 'POS Orders',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isInventoryEnabled || restaurant.inventory,
      label: 'Inventory',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isTakeawayEnabled || restaurant.takeaway,
      label: 'Takeaway',
      variant: 'neutral',
    },
    {
      enabled: allowsOnlineOrdering(restaurant),
      label: 'Online Orders',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isIhcOnly || restaurant.ihcOnly,
      label: 'IHC Only',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isOffline || restaurant.offline,
      label: 'Offline',
      variant: 'warning',
    },
  ];

  return enabledOptions
    .filter((option) => option.enabled)
    .map(({ enabled: _enabled, ...option }) => option);
}

export function getRestaurantImageError(file: File): string | undefined {
  if (!restaurantImageTypes.includes(file.type)) {
    return 'Choose a JPG, PNG, or WEBP image.';
  }

  if (file.size > restaurantImageMaxSizeBytes) {
    return 'Image must be 5MB or smaller.';
  }

  return undefined;
}

export function isObjectUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith('blob:'));
}

export async function uploadRestaurantImage(file: File): Promise<string> {
  const formData = new FormData();

  formData.append('file', file);

  // Sent with the user's sign-in (refreshed if it expired): the route refuses anyone who may
  // not create or edit restaurants.
  const body = await portalApi.request<{ url?: string }>('/uploads/restaurant-images', {
    body: formData,
    method: 'POST',
  });

  if (!body.url) {
    throw new Error('Unable to upload image.');
  }

  return body.url;
}

export const restaurantFormDefaultValues: RestaurantFormValues = {
  accountNumber: '',
  address: '',
  bankNameBranch: '',
  email: '',
  fssaiNumbers: '',
  gstNumber: '',
  hospitalId: '',
  ifscCode: '',
  isAtTableDiningEnabled: false,
  isDeliveryEnabled: false,
  isHomeDeliveryEnabled: false,
  isInCarDiningEnabled: false,
  isInRoomDiningEnabled: false,
  isInventoryEnabled: false,
  isIhcOnly: false,
  isOffline: false,
  isOnlineOrdersEnabled: false,
  isOpen24x7: false,
  isPosOrdersEnabled: false,
  isRegisteredInGst: false,
  isTakeawayEnabled: false,
  isVegOnly: false,
  isActive: true,
  legalEntityId: '',
  legalName: '',
  mobile: '',
  panNumber: '',
  restaurantName: '',
  sodexoMid: '',
  sodexoTid: '',
  sunBu: '',
  sunT1: '',
  sunT2: '',
  unitNameForQr: '',
  upiId: '',
};

export function toRestaurantFormDefaults(restaurant?: Restaurant): RestaurantFormValues {
  if (!restaurant) {
    return { ...restaurantFormDefaultValues };
  }

  return {
    accountNumber: restaurant.accountNumber ?? '',
    address: restaurant.gstAddress ?? restaurant.address ?? '',
    bankNameBranch: restaurant.bankNameBranch ?? restaurant.bankName ?? '',
    email: restaurant.email ?? '',
    fssaiNumbers: restaurant.fssaiNumbers ?? restaurant.fssaiNumber ?? '',
    gstNumber: restaurant.gstNumber ?? '',
    hospitalId: restaurant.hospitalId,
    ifscCode: restaurant.ifscCode ?? '',
    isActive: restaurant.isActive,
    isAtTableDiningEnabled: restaurant.isAtTableDiningEnabled ?? restaurant.atTableDining,
    isDeliveryEnabled: restaurant.isDeliveryEnabled ?? restaurant.delivery,
    isHomeDeliveryEnabled: restaurant.isHomeDeliveryEnabled ?? restaurant.homeDelivery,
    isInCarDiningEnabled: restaurant.isInCarDiningEnabled ?? restaurant.inCarDining,
    isInRoomDiningEnabled: restaurant.isInRoomDiningEnabled ?? restaurant.inRoomDiningEnabled,
    isInventoryEnabled: restaurant.isInventoryEnabled ?? restaurant.inventory,
    isIhcOnly: restaurant.isIhcOnly ?? restaurant.ihcOnly,
    isOffline: restaurant.isOffline ?? restaurant.offline,
    isOnlineOrdersEnabled: restaurant.isOnlineOrdersEnabled ?? restaurant.onlineOrders,
    isOpen24x7: restaurant.isOpen24x7 ?? restaurant.open24x7,
    isPosOrdersEnabled: restaurant.isPosOrdersEnabled ?? restaurant.posOrders,
    isRegisteredInGst: restaurant.isRegisteredInGst,
    isTakeawayEnabled: restaurant.isTakeawayEnabled ?? restaurant.takeaway,
    isVegOnly: restaurant.isVegOnly ?? restaurant.vegOnly,
    legalEntityId: restaurant.legalEntityId ?? '',
    legalName: restaurant.legalName ?? '',
    mobile: restaurant.mobile ?? '',
    panNumber: restaurant.panNumber ?? '',
    restaurantName: restaurant.restaurantName,
    sodexoMid: restaurant.sodexoMid ?? '',
    sodexoTid: restaurant.sodexoTid ?? '',
    sunBu: restaurant.sunBu ?? '',
    sunT1: restaurant.sunT1 ?? '',
    sunT2: restaurant.sunT2 ?? '',
    unitNameForQr: restaurant.unitNameForQr ?? restaurant.qrUnitName ?? '',
    upiId: restaurant.upiId ?? '',
  };
}

/** A blank box sends null, so emptying a field on an edit removes the saved value. */
const cleared = (value: string) => optionalValue(value) ?? null;

export function toRestaurantInput(
  values: RestaurantFormValues,
  imageUrls: { coverImageUrl?: string; thumbnailUrl?: string } = {},
): RestaurantInput {
  const address = cleared(values.address);

  return {
    accountNumber: cleared(values.accountNumber),
    address,
    bankNameBranch: cleared(values.bankNameBranch),
    coverImageUrl: imageUrls.coverImageUrl,
    email: cleared(values.email),
    fssaiNumbers: cleared(values.fssaiNumbers),
    gstAddress: address,
    gstNumber: cleared(values.gstNumber),
    hospitalId: values.hospitalId,
    ifscCode: cleared(values.ifscCode),
    isActive: values.isActive,
    isAtTableDiningEnabled: values.isAtTableDiningEnabled,
    isDeliveryEnabled: values.isDeliveryEnabled,
    isHomeDeliveryEnabled: values.isHomeDeliveryEnabled,
    isInCarDiningEnabled: values.isInCarDiningEnabled,
    isInRoomDiningEnabled: values.isInRoomDiningEnabled,
    isInventoryEnabled: values.isInventoryEnabled,
    isIhcOnly: values.isIhcOnly,
    // Offline is not active; Active decides, so an older record with both set is repaired on save.
    isOffline: !values.isActive,
    isOnlineOrdersEnabled: values.isOnlineOrdersEnabled,
    isOpen24x7: values.isOpen24x7,
    isPosOrdersEnabled: values.isPosOrdersEnabled,
    isRegisteredInGst: values.isRegisteredInGst,
    isTakeawayEnabled: values.isTakeawayEnabled,
    isVegOnly: values.isVegOnly,
    legalEntityId: values.legalEntityId || null,
    legalName: cleared(values.legalName),
    mobile: cleared(values.mobile),
    panNumber: cleared(values.panNumber),
    restaurantName: values.restaurantName.trim(),
    sodexoMid: cleared(values.sodexoMid),
    sodexoTid: cleared(values.sodexoTid),
    sunBu: cleared(values.sunBu),
    sunT1: cleared(values.sunT1),
    sunT2: cleared(values.sunT2),
    thumbnailUrl: imageUrls.thumbnailUrl,
    unitNameForQr: cleared(values.unitNameForQr),
    upiId: cleared(values.upiId),
  };
}
