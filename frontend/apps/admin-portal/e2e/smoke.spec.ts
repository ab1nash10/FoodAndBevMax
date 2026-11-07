import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { getPermittedPages } from '../lib/navigation';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * Every screen in the navigation, plus the kiosk and the TV board, opens without a crash, an
 * error page or a failed API call. Read-only: it only opens pages (the board link is fetched
 * with regenerate:false, which never turns an existing link off).
 */
const pages = getPermittedPages(() => true).map((page) => page.href.replace(/^\//, ''));
const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

/** Uncaught errors and API calls answered 4xx/5xx while `open` runs. */
async function problemsWhile(page: Page, open: () => Promise<void>): Promise<string[]> {
  const problems: string[] = [];
  const onError = (error: Error) => problems.push(`page error: ${error.message}`);
  const onResponse = (response: { status(): number; url(): string }) => {
    if (/:\d{4}\/api\//.test(response.url()) && response.status() >= 400) {
      problems.push(`${response.status()} ${response.url()}`);
    }
  };
  page.on('pageerror', onError);
  page.on('response', onResponse);
  try {
    await open();
    // Late calls (counts, lookups) land just after the first paint.
    await page.waitForLoadState('networkidle');
  } catch (error) {
    // A page that never finishes is one finding; the sweep goes on to the next page.
    problems.push(`did not open: ${(error as Error).message.split('\n')[0]}`);
  } finally {
    page.off('pageerror', onError);
    page.off('response', onResponse);
  }
  return problems;
}

// One test, one signed-in tab (see record-panels.spec.ts: separate contexts sign each other out).
test('every screen opens without errors', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  // The dev server compiles a route on its first visit, slowly on a busy machine.
  page.setDefaultTimeout(90_000);

  for (const path of pages) {
    await test.step(path, async () => {
      const problems = await problemsWhile(page, async () => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      });
      await expect.soft(page.getByText('Unable to load this page'), path).toHaveCount(0);
      expect.soft(problems, path).toEqual([]);

      // The Filters panel is never cut off by the list card it opens over.
      const filters = page.getByRole('button', { name: /^Filters/ });
      if (await filters.count()) {
        await filters.first().click();
        const reachable = await page.getByRole('dialog', { name: 'Filters' }).evaluate((panel) => {
          const box = panel.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 4);
          return box.bottom <= window.innerHeight && hit !== null && panel.contains(hit);
        });
        expect.soft(reachable, `${path}: Filters panel`).toBe(true);
        await page.keyboard.press('Escape');
      }
    });
  }
});

test('the kiosk and the TV board open with their link', async ({ page, request }) => {
  test.setTimeout(3 * 60_000);
  page.setDefaultTimeout(30_000);
  const session = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };
  const { accessToken } = JSON.parse(session.origins[0]?.localStorage[0]?.value ?? '{}') as {
    accessToken: string;
  };
  const headers = { authorization: `Bearer ${accessToken}` };
  const restaurants = await request.get(
    `${organizationApi}/restaurants?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc`,
    { headers },
  );
  const restaurant = ((await restaurants.json()) as { data: { items: { id: string }[] } }).data
    .items[0];
  test.skip(!restaurant, 'no active restaurant');
  const link = await request.post(`${organizationApi}/restaurants/${restaurant!.id}/board-link`, {
    data: { regenerate: false },
    headers,
  });
  const { boardToken } = ((await link.json()) as { data: { boardToken: string } }).data;
  const query = `${restaurant!.id}?token=${encodeURIComponent(boardToken)}`;

  const kioskProblems = await problemsWhile(page, async () => {
    await page.goto(`kiosk/${query}`);
  });
  await expect.soft(page.getByText(/kiosk is not set up|menu could not be loaded/i)).toHaveCount(0);
  expect.soft(kioskProblems, 'kiosk').toEqual([]);

  const boardProblems = await problemsWhile(page, async () => {
    await page.goto(`board/${query}`);
  });
  await expect
    .soft(page.getByText(/needs its board link|no longer valid|Connecting to AAHAR/i))
    .toHaveCount(0);
  expect.soft(boardProblems, 'board').toEqual([]);
});
