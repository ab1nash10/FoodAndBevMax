'use client';

import type {
  MenuServeAt,
  RestaurantMenuDayOfWeek,
  RestaurantMenuPositionType,
} from '@aahar/api-client';

export const dayOfWeekValues = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export const positionTypeValues = ['FIRST', 'LAST', 'BEFORE_ITEM', 'AFTER_ITEM'] as const;

/** GST slabs a menu price can carry; the server accepts the same list. */
export const gstSlabs = [0, 5, 12, 18] as const;

export const serveAtOptions: Array<{ label: string; value: MenuServeAt }> = [
  { label: 'Both', value: 'BOTH' },
  { label: 'Room Only', value: 'ROOM' },
  { label: 'Counter Only', value: 'COUNTER' },
];

export interface RestaurantMenuFormValues {
  accompaniments: string;
  addOn: string;
  /** HH:mm from the time inputs; both empty means all day. */
  availableFrom: string;
  availableTo: string;
  /** Narrows the Food Item list; not saved. */
  categoryId: string;
  daysOfWeek: RestaurantMenuDayOfWeek[];
  gstPercent: string;
  isActive: boolean;
  isAvailable: boolean;
  isDiscountable: boolean;
  isGstInclusive: boolean;
  itemId: string;
  kitchenId: string;
  positionType: RestaurantMenuPositionType | '';
  preparationTimeMinutes: string;
  price: string;
  referenceMenuId: string;
  restaurantId: string;
  roomPrice: string;
  serveAt: MenuServeAt;
  serves: string;
}

export function formatEnum(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}
