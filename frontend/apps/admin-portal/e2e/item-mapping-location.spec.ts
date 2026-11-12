import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * Map item (Item Locations) asks for the location first, filled in from the header's location:
 * the stores or kitchens offered are only that location's. With "All locations" in the header
 * the user picks the location, and nothing can be picked before. Read-only: no mapping is saved.
 */
const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

async function list(path: string): Promise<Record<string, unknown>[]> {
  const saved = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };
  const { accessToken } = JSON.parse(saved.origins[0]!.localStorage[0]!.value) as {
    accessToken: string;
  };
  const response = await fetch(`${organizationApi}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.status, path).toBe(200);
  return ((await response.json()) as { data: { items: Record<string, unknown>[] } }).data.items;
}

const parents = [
  { label: 'Store', list: 'stores', tab: 'Store items' },
  { label: 'Kitchen', list: 'kitchens', tab: 'Kitchen items' },
] as const;
type Parent = (typeof parents)[number];

const field = (page: Page, label: string) =>
  page.getByRole('combobox', { name: `${label} (required)` });

/** The parent dropdown's real choices (not its "Select …" prompt). */
async function choices(page: Page, label: string) {
  const options = await field(page, label).locator('option').all();
  const values = await Promise.all(options.map((option) => option.getAttribute('value')));
  return values.filter(Boolean).sort();
}

/** Map item on the parent's tab, once that tab's list has replaced the other one. */
async function openMapItem(page: Page, parent: Parent) {
  const tab = page.getByRole('tab', { name: parent.tab });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Map item' }).click();
  await expect(page.getByRole('dialog', { name: `Map Item to ${parent.label}` })).toBeVisible();
}

for (const parent of parents) {
  test(`${parent.tab}: Map item fills in the header's location and offers only its ${parent.list}`, async ({
    page,
  }) => {
    const all = await list(`/${parent.list}?isActive=true&limit=100`);
    const byLocation = new Map<string, string[]>();
    for (const record of all) {
      const id = String(record.hospitalId);
      byLocation.set(id, [...(byLocation.get(id) ?? []), String(record.id)]);
    }
    const [hospitalId, ids] = [...byLocation].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
    test.skip(!hospitalId || !ids, `no active ${parent.list} to map to`);
    const expected = [...ids!].sort();

    await test.step('a location chosen in the header: filled in and fixed', async () => {
      await page.addInitScript(
        (id) => window.localStorage.setItem('aahar.location-context', String(id)),
        hospitalId,
      );
      await page.goto('masters/item-mapping');
      await openMapItem(page, parent);

      const location = field(page, 'Location');
      await expect(location).toHaveValue(hospitalId!);
      await expect(location).toBeDisabled();
      await expect.poll(() => choices(page, parent.label)).toEqual(expected);
    });

    await test.step('"All locations": the location is picked first', async () => {
      await page.addInitScript(() => window.localStorage.setItem('aahar.location-context', 'all'));
      await page.goto('masters/item-mapping');
      await openMapItem(page, parent);

      const location = field(page, 'Location');
      await expect(location).toBeEnabled();
      await expect(location).toHaveValue('');
      await expect(field(page, parent.label)).toBeDisabled();

      await location.selectOption(hospitalId!);
      await expect(field(page, parent.label)).toBeEnabled();
      await expect.poll(() => choices(page, parent.label)).toEqual(expected);
    });
  });
}
