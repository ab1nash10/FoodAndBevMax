'use client';

import type { RestaurantMenuDayOfWeek, RestaurantMenuPositionType } from '@aahar/api-client';

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

export interface RestaurantMenuFormValues {
  daysOfWeek: RestaurantMenuDayOfWeek[];
  isAvailable: boolean;
  itemId: string;
  positionType: RestaurantMenuPositionType | '';
  referenceMenuId: string;
  restaurantId: string;
  timeSlotIds: string[];
}

export function formatEnum(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}
