'use client';

import type { Restaurant, RestaurantInput } from '@aahar/api-client';
import { withBasePath } from '@/lib/base-path';
import type {
  RestaurantFormValues,
  RestaurantOptionBadge,
} from '@/components/organization/shared/types';
import { optionalValue } from '@/components/organization/shared/utils';

const restaurantImageMaxSizeBytes = 5 * 1024 * 1024;

const restaurantImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

export function isRestaurantOnline(restaurant: Restaurant): boolean {
  return (
    restaurant.isOnlineOrdersEnabled || restaurant.onlineOrders || restaurant.onlineOrderingEnabled
  );
}

export function getRestaurantOptionBadges(restaurant: Restaurant): RestaurantOptionBadge[] {
  const badges: RestaurantOptionBadge[] = [
    {
      label: restaurant.isActive ? 'Active' : 'Inactive',
      variant: restaurant.isActive ? 'success' : 'danger',
    },
  ];
  const enabledOptions: Array<RestaurantOptionBadge & { enabled: boolean }> = [
    { enabled: isRestaurantOnline(restaurant), label: 'Online', variant: 'info' },
    {
      enabled: restaurant.isOpen24x7 || restaurant.open24x7,
      label: 'Open 24x7',
      variant: 'info',
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
      enabled: restaurant.isVegOnly || restaurant.vegOnly,
      label: 'Veg Only',
      variant: 'success',
    },
    {
      enabled: restaurant.isTakeawayEnabled || restaurant.takeaway,
      label: 'Takeaway',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isDeliveryEnabled || restaurant.delivery,
      label: 'Delivery',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isHomeDeliveryEnabled || restaurant.homeDelivery,
      label: 'Home Delivery',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isAtTableDiningEnabled || restaurant.atTableDining,
      label: 'At Table Dining',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isInCarDiningEnabled || restaurant.inCarDining,
      label: 'In Car Dining',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isOffline || restaurant.offline,
      label: 'Offline',
      variant: 'warning',
    },
  ];

  badges.push(
    ...enabledOptions
      .filter((option) => option.enabled)
      .map(({ enabled: _enabled, ...option }) => option),
  );

  return badges;
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

  // withBasePath: Next's basePath does not apply to a raw fetch.
  const response = await fetch(withBasePath('/api/uploads/restaurant-images'), {
    body: formData,
    method: 'POST',
  });
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    url?: string;
  } | null;

  if (!response.ok || !body?.url) {
    throw new Error(body?.message ?? 'Unable to upload image.');
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
  isOffline: false,
  isOnlineOrdersEnabled: false,
  isOpen24x7: false,
  isPosOrdersEnabled: false,
  isRegisteredInGst: false,
  isTakeawayEnabled: false,
  isVegOnly: false,
  isActive: true,
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
    isOffline: restaurant.isOffline ?? restaurant.offline,
    isOnlineOrdersEnabled: isRestaurantOnline(restaurant),
    isOpen24x7: restaurant.isOpen24x7 ?? restaurant.open24x7,
    isPosOrdersEnabled: restaurant.isPosOrdersEnabled ?? restaurant.posOrders,
    isRegisteredInGst: restaurant.isRegisteredInGst,
    isTakeawayEnabled: restaurant.isTakeawayEnabled ?? restaurant.takeaway,
    isVegOnly: restaurant.isVegOnly ?? restaurant.vegOnly,
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

export function toRestaurantInput(
  values: RestaurantFormValues,
  imageUrls: { coverImageUrl?: string; thumbnailUrl?: string } = {},
): RestaurantInput {
  const address = optionalValue(values.address);

  return {
    accountNumber: optionalValue(values.accountNumber),
    address,
    bankNameBranch: optionalValue(values.bankNameBranch),
    coverImageUrl: imageUrls.coverImageUrl,
    email: optionalValue(values.email),
    fssaiNumbers: optionalValue(values.fssaiNumbers),
    gstAddress: address,
    gstNumber: optionalValue(values.gstNumber),
    hospitalId: values.hospitalId,
    ifscCode: optionalValue(values.ifscCode),
    isActive: values.isActive,
    isAtTableDiningEnabled: values.isAtTableDiningEnabled,
    isDeliveryEnabled: values.isDeliveryEnabled,
    isHomeDeliveryEnabled: values.isHomeDeliveryEnabled,
    isInCarDiningEnabled: values.isInCarDiningEnabled,
    isInRoomDiningEnabled: values.isInRoomDiningEnabled,
    isInventoryEnabled: values.isInventoryEnabled,
    isOffline: values.isOffline,
    isOnlineOrdersEnabled: values.isOnlineOrdersEnabled,
    isOpen24x7: values.isOpen24x7,
    isPosOrdersEnabled: values.isPosOrdersEnabled,
    isRegisteredInGst: values.isRegisteredInGst,
    isTakeawayEnabled: values.isTakeawayEnabled,
    isVegOnly: values.isVegOnly,
    legalName: optionalValue(values.legalName),
    mobile: optionalValue(values.mobile),
    panNumber: optionalValue(values.panNumber),
    restaurantName: values.restaurantName.trim(),
    sodexoMid: optionalValue(values.sodexoMid),
    sodexoTid: optionalValue(values.sodexoTid),
    sunBu: optionalValue(values.sunBu),
    sunT1: optionalValue(values.sunT1),
    sunT2: optionalValue(values.sunT2),
    thumbnailUrl: imageUrls.thumbnailUrl,
    unitNameForQr: optionalValue(values.unitNameForQr),
    upiId: optionalValue(values.upiId),
  };
}
