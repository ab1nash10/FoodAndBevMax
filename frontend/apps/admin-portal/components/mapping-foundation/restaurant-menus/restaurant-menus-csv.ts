import type {
  MenuServeAt,
  RestaurantMenu,
  RestaurantMenuDayOfWeek,
  RestaurantMenuInput,
} from '@aahar/api-client';
import {
  activeStatus,
  fetchAllPages,
  numberCell,
  yesNo,
  type CsvColumn,
  type CsvRowImporter,
} from '@/components/csv-import-export';
import {
  dayOfWeekValues,
  formatEnum,
  gstSlabs,
} from '@/components/mapping-foundation/restaurant-menus/shared';
import { organizationApi } from '@/lib/api';

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
  { header: 'Kitchen code', value: (menu) => menu.kitchen?.kitchenCode },
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

function serveAtCell(value: string): MenuServeAt {
  const key = value.toLowerCase().replace(/\s*only$/, '');

  if (!value || key === 'both') {
    return 'BOTH';
  }

  if (key === 'room') {
    return 'ROOM';
  }

  if (key === 'counter') {
    return 'COUNTER';
  }

  throw new Error('Serve at must be Both, Room only or Counter only');
}

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

/**
 * A row with a Menu code updates that menu item, as does a row for a restaurant and item that
 * are already on a menu together; any other row adds the item to the restaurant's menu. Rows
 * refer to restaurants, items and kitchens by code, and the server checks the rest as the
 * form does (prices for where it is served, a kitchen at the restaurant's location).
 */
export async function startMenuImport(): Promise<CsvRowImporter> {
  const [restaurants, items, kitchens, menus] = await Promise.all([
    fetchAllPages((page) => organizationApi.listRestaurants({ limit: 100, page })),
    fetchAllPages((page) => organizationApi.listItems({ limit: 100, page })),
    fetchAllPages((page) => organizationApi.listKitchens({ limit: 100, page })),
    fetchAllPages((page) => organizationApi.listRestaurantMenus({ limit: 100, page })),
  ]);
  const upper = (value: string) => value.trim().toUpperCase();
  const itemByCode = new Map(items.map((item) => [upper(item.itemCode), item]));
  const menuByCode = new Map(menus.map((menu) => [upper(menu.menuItemCode), menu]));
  const menuByPair = new Map(menus.map((menu) => [`${menu.restaurantId}:${menu.itemId}`, menu]));

  return async (cells) => {
    const menuCode = upper(cells('Menu code'));
    const restaurantCode = upper(cells('Restaurant code'));
    const itemCode = upper(cells('Item code'));
    const kitchenCode = upper(cells('Kitchen code'));

    if (!restaurantCode || !itemCode) {
      throw new Error('Restaurant code and Item code are required');
    }

    // Codes are unique within a location, so the same code at two locations is ambiguous.
    const restaurantMatches = restaurants.filter(
      (restaurant) => upper(restaurant.restaurantCode) === restaurantCode,
    );

    if (restaurantMatches.length !== 1) {
      throw new Error(
        restaurantMatches.length
          ? `Restaurant code ${restaurantCode} is used at more than one location`
          : `No restaurant you can reach has code ${restaurantCode}`,
      );
    }

    const restaurant = restaurantMatches[0]!;
    const item = itemByCode.get(itemCode);

    if (!item) {
      throw new Error(`No item has code ${itemCode}`);
    }

    const kitchen = kitchenCode
      ? kitchens.find(
          (option) =>
            option.hospitalId === restaurant.hospitalId &&
            upper(option.kitchenCode) === kitchenCode,
        )
      : null;

    if (kitchen === undefined) {
      throw new Error(
        `No kitchen at ${restaurant.restaurantName}'s location has code ${kitchenCode}`,
      );
    }

    const byCode = menuCode ? menuByCode.get(menuCode) : undefined;

    if (menuCode && !byCode) {
      throw new Error(`No menu item has code ${menuCode}; leave Menu code empty to add one`);
    }

    const match = byCode ?? menuByPair.get(`${restaurant.id}:${item.id}`);
    const gstPercent = numberCell(cells('GST %'), 'GST %', 2) ?? 0;

    if (!(gstSlabs as readonly number[]).includes(gstPercent)) {
      throw new Error(`GST % must be one of ${gstSlabs.join(', ')}`);
    }

    const body: RestaurantMenuInput = {
      accompaniments: cells('Accompaniments') || null,
      addOn: cells('Add-on') || null,
      availableFrom: timeCell(cells('Available from'), 'Available from'),
      availableTo: timeCell(cells('Available to'), 'Available to'),
      daysOfWeek: daysCell(cells('Days')),
      gstPercent,
      isActive: activeStatus(cells('Status'), match?.isActive ?? true),
      isAvailable: yesNo(cells('Available'), match?.isAvailable ?? true, 'Available'),
      isDiscountable: yesNo(cells('Discountable'), match?.isDiscountable ?? false, 'Discountable'),
      isGstInclusive: yesNo(
        cells('GST inclusive'),
        match?.isGstInclusive ?? false,
        'GST inclusive',
      ),
      itemId: item.id,
      kitchenId: kitchen?.id ?? null,
      preparationTimeMinutes: numberCell(cells('Prep time (min)'), 'Prep time (min)'),
      price: numberCell(cells('Price'), 'Price', 2),
      restaurantId: restaurant.id,
      roomPrice: numberCell(cells('In-room price'), 'In-room price', 2),
      serveAt: serveAtCell(cells('Serve at')),
      serves: numberCell(cells('Serves'), 'Serves'),
    };

    // A price for a place it is not served at is cleared, as the form does.
    if (body.serveAt === 'ROOM') {
      body.price = null;
    } else if (body.serveAt === 'COUNTER') {
      body.roomPrice = null;
    }

    if (match) {
      await organizationApi.updateRestaurantMenu(match.id, body);

      return 'updated';
    }

    const { data } = await organizationApi.createRestaurantMenu(body);

    // A later row for the same restaurant and item in this file updates it.
    menuByPair.set(`${data.restaurantId}:${data.itemId}`, data);
    menuByCode.set(upper(data.menuItemCode), data);

    return 'created';
  };
}
