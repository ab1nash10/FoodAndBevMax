import type { KioskMenuItem } from '@aahar/api-client';

export type KioskFilter = 'all' | 'featured' | 'veg';
export type KioskSort = 'high' | 'low' | 'menu';

/** The category rail: each category in menu order with its dish count; '' gathers the rest. */
export function categoriesOf(
  items: readonly KioskMenuItem[],
): Array<{ count: number; id: string; name: string }> {
  const found = new Map<string, { count: number; id: string; name: string }>();

  for (const item of items) {
    const id = item.category?.id ?? '';
    const entry = found.get(id) ?? { count: 0, id, name: item.category?.categoryName ?? 'Other' };
    entry.count += 1;
    found.set(id, entry);
  }

  // "Other" last, whatever the order the uncategorised dishes came in.
  return [...found.values()].sort((a, b) => Number(a.id === '') - Number(b.id === ''));
}

/** The dishes shown: one category (null: all), a chip's filter, and the sort. */
export function visibleItems(
  items: readonly KioskMenuItem[],
  view: { category: string | null; filter: KioskFilter; sort: KioskSort },
): KioskMenuItem[] {
  const shown = items.filter(
    (item) =>
      (view.category === null || (item.category?.id ?? '') === view.category) &&
      (view.filter !== 'featured' || item.isFeatured) &&
      (view.filter !== 'veg' || item.foodType === 'VEG'),
  );

  if (view.sort === 'menu') return shown;

  return shown.sort((a, b) => (view.sort === 'low' ? a.price - b.price : b.price - a.price));
}

/** The sort button cycles: menu order → price low to high → high to low → menu order. */
export function nextSort(sort: KioskSort): KioskSort {
  return sort === 'menu' ? 'low' : sort === 'low' ? 'high' : 'menu';
}
