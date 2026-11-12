import { describe, expect, it } from 'vitest';
import type { KioskMenuItem } from '@aahar/api-client';
import { categoriesOf, nextSort, visibleItems } from './kiosk-browse';

const item = (
  id: string,
  price: number,
  category: string | null,
  patch: Partial<KioskMenuItem> = {},
): KioskMenuItem => ({
  category: category ? { categoryName: category, id: category, sortOrder: 0 } : null,
  foodType: 'VEG',
  gstPercent: 5,
  id,
  isDiscountable: false,
  isFeatured: false,
  isGstInclusive: true,
  itemName: id,
  preparationTimeMinutes: null,
  price,
  ...patch,
});

const menu = [
  item('Thali', 110, 'Meals', { isFeatured: true }),
  item('Biryani', 160, 'Meals', { foodType: 'NON_VEG' }),
  item('Coffee', 10, 'Beverages'),
  item('Samosa', 20, null),
];

describe('kiosk browsing', () => {
  it('categories in menu order, with how many each has; dishes without one under Other', () => {
    expect(categoriesOf(menu)).toEqual([
      { count: 2, id: 'Meals', name: 'Meals' },
      { count: 1, id: 'Beverages', name: 'Beverages' },
      { count: 1, id: '', name: 'Other' },
    ]);
  });

  it('filters by category, featured and veg, and keeps menu order unless sorted', () => {
    const ids = (list: KioskMenuItem[]) => list.map((entry) => entry.id);
    expect(ids(visibleItems(menu, { category: 'Meals', filter: 'all', sort: 'menu' }))).toEqual([
      'Thali',
      'Biryani',
    ]);
    expect(ids(visibleItems(menu, { category: null, filter: 'featured', sort: 'menu' }))).toEqual([
      'Thali',
    ]);
    expect(ids(visibleItems(menu, { category: null, filter: 'veg', sort: 'menu' }))).toEqual([
      'Thali',
      'Coffee',
      'Samosa',
    ]);
    expect(ids(visibleItems(menu, { category: '', filter: 'all', sort: 'menu' }))).toEqual([
      'Samosa',
    ]);
  });

  it('sorts by price both ways, and the toggle goes menu → low → high → menu', () => {
    const prices = (sort: 'high' | 'low') =>
      visibleItems(menu, { category: null, filter: 'all', sort }).map((entry) => entry.price);
    expect(prices('low')).toEqual([10, 20, 110, 160]);
    expect(prices('high')).toEqual([160, 110, 20, 10]);
    expect([nextSort('menu'), nextSort('low'), nextSort('high')]).toEqual(['low', 'high', 'menu']);
  });
});
