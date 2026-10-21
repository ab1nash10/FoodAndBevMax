import type { MenuServeAt, RestaurantMenu, RestaurantMenuDayOfWeek } from '@aahar/api-client';
import { type CsvColumn } from '@/components/csv-import-export';
import {
  dayOfWeekValues,
  formatEnum,
} from '@/components/mapping-foundation/restaurant-menus/shared';

const serveAtText: Record<MenuServeAt, string> = {
  BOTH: 'Both',
  COUNTER: 'Counter only',
  ROOM: 'Room only',
};

const yes = (value: boolean) => (value ? 'Yes' : 'No');

export const menuColumns: Array<CsvColumn<RestaurantMenu>> = [
  { header: 'Menu code', value: (menu) => menu.menuItemCode },
  { header: 'Restaurant code', value: (menu) => menu.restaurant.restaurantCode },
  { header: 'Restaurant', readOnly: true, value: (menu) => menu.restaurant.restaurantName },
  { header: 'Item code', value: (menu) => menu.item.itemCode },
  { header: 'Item', readOnly: true, value: (menu) => menu.item.itemName },
  { header: 'Category', value: (menu) => menu.category?.categoryName },
  { header: 'Kitchen code', value: (menu) => menu.kitchen?.kitchenCode },
  { header: 'Store code', value: (menu) => menu.store?.storeCode },
  {
    header: 'Store / Kitchen',
    readOnly: true,
    value: (menu) =>
      menu.kitchen
        ? `${menu.kitchen.kitchenName} (kitchen)`
        : menu.store
          ? `${menu.store.storeName} (store)`
          : '',
  },
  { header: 'Serve at', value: (menu) => serveAtText[menu.serveAt] },
  { header: 'Price', value: (menu) => menu.price },
  { header: 'In-room price', value: (menu) => menu.roomPrice },
  { header: 'GST %', value: (menu) => menu.gstPercent },
  { header: 'GST inclusive', value: (menu) => yes(menu.isGstInclusive) },
  { header: 'Available from', value: (menu) => menu.availableFrom },
  { header: 'Available to', value: (menu) => menu.availableTo },
  { header: 'Days', value: (menu) => menu.daysOfWeek.map(formatEnum).join(', ') },
  { header: 'Add-on', value: (menu) => menu.addOn },
  { header: 'Accompaniments', value: (menu) => menu.accompaniments },
  { header: 'Prep time (min)', value: (menu) => menu.preparationTimeMinutes },
  { header: 'Serves', value: (menu) => menu.serves },
  { header: 'Discountable', value: (menu) => yes(menu.isDiscountable) },
  { header: 'Available', value: (menu) => yes(menu.isAvailable) },
  { header: 'Status', value: (menu) => (menu.isActive ? 'Active' : 'Inactive') },
];

/** "Monday, Tue" → days; blank or "Every day" is every day. */
export function daysCell(value: string): RestaurantMenuDayOfWeek[] {
  if (!value || /^(every ?day|all|daily)$/i.test(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(/[,;/]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const day = dayOfWeekValues.find(
            (option) => part.length >= 3 && option.startsWith(part.toUpperCase()),
          );

          if (!day) {
            throw new Error(`"${part}" is not a day of the week`);
          }

          return day;
        }),
    ),
  ];
}

/** "7:00", "07:00" or "07:00:00" (as Excel saves it) → "07:00"; blank is null. */
export function timeCell(value: string, header: string): string | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):([0-5]\d)(:[0-5]\d)?$/.exec(value);

  if (!match || Number(match[1]) > 23) {
    throw new Error(`${header} must be a time like 07:30`);
  }

  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}
