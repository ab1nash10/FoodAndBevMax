import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

function token(): string {
  const session = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };
  return (JSON.parse(session.origins[0]?.localStorage[0]?.value ?? '{}') as { accessToken: string })
    .accessToken;
}

async function list<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const response = await request.get(`${organizationApi}${path}`, {
    headers: { authorization: `Bearer ${token()}` },
  });
  expect(response.ok(), `GET ${path}: ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: { items: T[] } }).data.items;
}

// Fixed names: a second run finds them and updates them, so nothing piles up.
const beds = ['E2E Bed A', 'E2E Bed B'];

// The hospitals' own room lists (Room Name, Room Status, Floor Code, Tower Code) import as they
// are, into the location chosen at the top; each room's QR then opens ordering for that room.
test('rooms import from a hospital room list, and a room QR orders to that room', async ({
  browser,
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  const locations = await list<{ hospitalName: string; id: string }>(
    request,
    '/hospitals?isActive=true&limit=100',
  );
  // Patparganj has a restaurant that delivers to rooms; elsewhere, the first location.
  const location =
    locations.find((candidate) => /patparganj/i.test(candidate.hospitalName)) ?? locations[0];
  test.skip(!location, 'no active location');
  await page.addInitScript(
    (id) => localStorage.setItem('aahar.location-context', id),
    location!.id,
  );

  await page.goto('masters/rooms');
  await expect(page.getByRole('heading', { name: 'Rooms & tables' })).toBeVisible();
  await page.getByRole('button', { exact: true, name: 'Import' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).click();
  await (
    await chooser
  ).setFiles({
    buffer: Buffer.from(
      ['Room Name,Room Status,Floor Code,Tower Code', ...beds.map((bed) => `${bed},Active,,`)].join(
        '\n',
      ),
    ),
    mimeType: 'text/csv',
    name: 'rooms.csv',
  });
  const result = page.getByRole('dialog', { name: 'Imported rooms' });
  await expect(result).toContainText(/2\s*added, 0\s*updated|0\s*added, 2\s*updated/);
  await result.getByRole('button', { name: 'Done' }).click();

  // Edit: rename, then back. A new name each run: a run stopped between the two saves leaves
  // its room renamed, and a fixed name would then be taken (409) and fail every run after it.
  const renamed = `${beds[0]} ${Date.now().toString(36)}`;
  await page.getByRole('searchbox', { name: 'Search rooms' }).fill(beds[0]!);
  await page.getByRole('button', { exact: true, name: `Edit ${beds[0]}` }).click();
  const editor = page.getByRole('dialog', { name: 'Edit room' });
  await editor.getByLabel('Room or bed').fill(renamed);
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(editor).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search rooms' }).fill(renamed);
  await page.getByRole('button', { name: `Edit ${renamed}` }).click();
  await editor.getByLabel('Room or bed').fill(beds[0]!);
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(editor).toBeHidden();

  // Kept exactly as typed: no Title Case on a bed's name ("Bed A", not "Bed a").
  await page.getByRole('searchbox', { name: 'Search rooms' }).fill(beds[0]!);
  await expect(page.getByText(beds[0]!, { exact: true })).toBeVisible();

  // Export: each room with its QR link.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { exact: true, name: 'Export' }).click();
  const exported = readFileSync(await (await download).path(), 'utf8');
  expect(exported.split(/\r?\n/)[0]).toContain('Room code,Room name,Location code');
  expect(exported).toContain('QR link');
  expect(exported).toMatch(new RegExp(`${beds[0]}.*Active.*/order/room/[0-9a-f-]{36}`));

  // The room's QR holds its ordering link.
  await page.getByRole('button', { exact: true, name: `QR code for ${beds[0]}` }).click();
  await expect(
    page.getByRole('img', { exact: true, name: `QR code for ${beds[0]}` }),
  ).toBeVisible();
  const link = await page.getByLabel('Ordering link').inputValue();
  expect(link).toMatch(/\/order\/room\/[0-9a-f-]{36}$/);

  // Room service: only restaurants with In room Dining switched on are offered to a bed.
  const roomId = link.split('/').pop()!;
  const { data } = (await (await request.get(`${organizationApi}/qr/rooms/${roomId}`)).json()) as {
    data: { restaurants: Array<{ id: string; open: boolean; restaurantName: string }> };
  };
  const delivering = (
    await list<{ id: string; inRoomDiningEnabled: boolean }>(
      request,
      `/restaurants?hospitalId=${location!.id}&limit=100`,
    )
  )
    .filter((restaurant) => restaurant.inRoomDiningEnabled)
    .map((restaurant) => restaurant.id);
  expect(data.restaurants.filter((restaurant) => !delivering.includes(restaurant.id))).toEqual([]);

  // A guest's phone, no sign-in: the bed, and the restaurants that deliver to it.
  const phone = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { height: 800, width: 390 },
  });
  const guest = await phone.newPage();

  await guest.goto(link.replace(/^https?:\/\/[^/]+/, new URL(page.url()).origin));
  await expect(guest.getByRole('region', { name: 'Where your food goes' })).toContainText(beds[0]!);
  // An open one opens its menu, the bed filled in and not asked; a closed one says so.
  const open = data.restaurants.find((restaurant) => restaurant.open);
  if (open) {
    await guest.getByRole('link', { name: open.restaurantName }).click();
    await expect(guest.getByText(`To ${beds[0]}`)).toBeVisible();
  } else if (data.restaurants.length) {
    await expect(guest.getByText('Closed').first()).toBeVisible();
  } else {
    await expect(guest.getByText('No restaurant here delivers to rooms')).toBeVisible();
  }
  await phone.close();
});

// A restaurant's dine-in tables: added in a run on the Tables tab (the restaurant picked in the
// form, no filter needed), imported from a sheet, each QR opening that restaurant's ordering with
// the table filled in (or saying At Table Dining is off).
test('tables are added to a restaurant in a run or imported, each with its own QR', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  const locations = await list<{ hospitalName: string; id: string }>(
    request,
    '/hospitals?isActive=true&limit=100',
  );
  const location =
    locations.find((candidate) => /patparganj/i.test(candidate.hospitalName)) ?? locations[0];
  test.skip(!location, 'no active location');
  const [restaurant] = await list<{
    atTableDining: boolean;
    id: string;
    restaurantCode: string;
    restaurantName: string;
  }>(request, `/restaurants?hospitalId=${location!.id}&isActive=true&limit=100`);
  test.skip(!restaurant, 'no active restaurant');
  await page.addInitScript(
    (id) => localStorage.setItem('aahar.location-context', id),
    location!.id,
  );

  await page.goto('masters/rooms');
  await page.getByRole('tab', { name: 'Tables' }).click();
  await page.getByRole('button', { name: 'Add tables' }).click();
  const adding = page.getByRole('dialog', { name: 'Add tables' });
  await adding.getByRole('combobox', { name: /Restaurant/ }).selectOption(restaurant!.id);
  await adding.getByLabel('Name before the number').fill('E2E T');
  await adding.getByLabel('To number').fill('2');
  await adding.getByRole('button', { name: 'Add E2E T1 to E2E T2' }).click();
  // Fixed names: the first run adds both, a later one finds them already there.
  await expect(page.getByText(/^[02] tables added$/)).toBeVisible();

  // From a sheet: the restaurant by its code.
  await page.getByRole('button', { exact: true, name: 'Import' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).click();
  await (
    await chooser
  ).setFiles({
    buffer: Buffer.from(`Table name,Restaurant\nE2E T3,${restaurant!.restaurantCode}\n`),
    mimeType: 'text/csv',
    name: 'tables.csv',
  });
  const result = page.getByRole('dialog', { name: 'Imported tables' });
  await expect(result).toContainText(/1\s*added, 0\s*updated|0\s*added, 1\s*updated/);
  await result.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('searchbox', { name: 'Search tables' }).fill('E2E T1');
  const row = page.getByRole('row', { name: /E2E T1/ });
  await expect(row).toContainText(restaurant!.restaurantName);
  await page.getByRole('button', { name: 'QR code for E2E T1' }).click();
  const link = await page.getByLabel('Ordering link').inputValue();
  expect(link).toMatch(/\/order\/table\/[0-9a-f-]{36}$/);

  const opened = await request.get(`${organizationApi}/qr/tables/${link.split('/').pop()!}`);
  if (restaurant!.atTableDining) {
    expect(((await opened.json()) as { data: { restaurantId: string } }).data.restaurantId).toBe(
      restaurant!.id,
    );
  } else {
    expect(opened.status()).toBe(400);
    // In the QR dialog (the "tables added" toast is a status too).
    await expect(page.getByRole('dialog').getByRole('status')).toContainText(
      'At Table Dining is off',
    );
  }
});
