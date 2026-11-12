import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * Freeze panes: on every list, the column headings stay in view while the rows scroll under
 * them. Every screen of the portal, in a laptop-height window so lists run longer than the
 * screen; a screen without a table is passed over. Read-only.
 */
const screens = [
  'dashboard',
  'inventory/grns',
  'inventory/restaurant-stock',
  'inventory/stock-ledgers',
  'inventory/stock-levels',
  'inventory/store-stock',
  'inventory/today',
  'inventory/transfers',
  'kitchen/productions',
  'kitchen/stock',
  'logs/activity',
  'logs/erp',
  'masters/companies',
  'masters/counters',
  'masters/employee-discounts',
  'masters/employees',
  'masters/entities',
  'masters/hospitals',
  'masters/item-categories',
  'masters/item-mapping',
  'masters/items',
  // Items opens as cards; its list view is a table.
  'masters/items?view=list',
  'masters/kitchen-items',
  'masters/kitchens',
  'masters/locations',
  'masters/orders',
  'masters/pos',
  'masters/restaurant-menus',
  'masters/restaurants',
  'masters/store-items',
  'masters/stores',
  'pos/day',
  'pos/history',
  'pos/menu',
  'pos/orders',
  'pos/receive',
  'pos/stock',
  'reports',
  'reports/audit',
  'users',
];

test.use({ viewport: { height: 640, width: 1366 } });

test('every list keeps its headings in view while its rows scroll', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const withTables: string[] = [];
  const scrolled: string[] = [];

  for (const screen of screens) {
    await test.step(screen, async () => {
      await page.goto(screen);
      await page.waitForLoadState('networkidle');
      const headings = page.locator('main thead th, main [role="columnheader"]');

      try {
        await headings.first().waitFor({ timeout: 5_000 });
      } catch {
        return; // No list on this screen (a form, a board, or no rows to show).
      }

      withTables.push(screen);
      const results = await page.evaluate(() =>
        [...document.querySelectorAll('main table, main [role="table"]')].map((table) => {
          const heading = table.querySelector('thead th, [role="columnheader"]');
          let box = heading?.parentElement ?? null;
          // The nearest box that scrolls up and down is what the heading sticks to.
          while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) {
            box = box.parentElement;
          }

          if (!heading || !box || box === document.scrollingElement) {
            return { pinned: false, reason: 'no scrolling box', scrolls: false };
          }

          const fits = box.getBoundingClientRect().height <= window.innerHeight - 64 + 1;
          if (box.scrollHeight <= box.clientHeight) return { fits, pinned: true, scrolls: false };

          const headingShows = () => {
            const rect = heading.getBoundingClientRect();
            const at = document.elementFromPoint(rect.left + 4, rect.top + rect.height / 2);
            return Boolean(at && heading.contains(at));
          };

          box.scrollTop = Math.min(400, box.scrollHeight - box.clientHeight);
          const pinned =
            Math.abs(heading.getBoundingClientRect().top - box.getBoundingClientRect().top) < 2 &&
            headingShows();

          // The last rows: the rows scrolled to their end, then the page scrolled on until the
          // whole list card (its pagination too) is in view. The heading must still show.
          box.scrollTop = box.scrollHeight;
          const card = (box.closest('.rounded-card') ?? box.parentElement)!;
          card.scrollIntoView({ behavior: 'instant', block: 'end' });
          const atEnd = headingShows();
          box.scrollTop = 0;
          window.scrollTo({ behavior: 'instant', top: 0 });

          return { atEnd, fits, pinned, scrolls: true };
        }),
      );

      results.forEach((result, index) => {
        const where = `${screen}, list ${index + 1}`;
        expect(result.pinned, `${where}: headings stay on top of the rows`).toBe(true);
        expect(result.fits, `${where}: the list fits under the top bar`).toBe(true);
        if (result.scrolls) {
          expect(result.atEnd, `${where}: headings still show at the last rows`).toBe(true);
          scrolled.push(where);
        }
      });
    });
  }

  console.log(`lists: ${withTables.length} screens; scrolled: ${scrolled.join(', ')}`);
  // The local data must give some lists more rows than one screen, or nothing was shown.
  expect(scrolled.length, `lists that scrolled: ${scrolled.join(', ')}`).toBeGreaterThan(2);
});
