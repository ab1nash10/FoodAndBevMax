import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

type Location = { id: string; legalEntityId: string | null };
type Entity = { gstNumber: string; id: string };

async function list<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const session = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };
  const { accessToken } = JSON.parse(session.origins[0]?.localStorage[0]?.value ?? '{}') as {
    accessToken: string;
  };
  const response = await request.get(`${organizationApi}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  return ((await response.json()) as { data: { items: T[] } }).data.items;
}

/** Opens a new restaurant with the top bar on `locationContext` ('all' or a location id). */
async function openNewRestaurant(page: Page, locationContext: string) {
  page.setDefaultTimeout(30_000);
  await page.addInitScript((value) => {
    window.localStorage.setItem('aahar.location-context', value);
  }, locationContext);
  await page.goto('masters/restaurants/new');
  await expect(page.locator('#restaurant-legal-entity')).toBeEnabled();
}

// A restaurant bills under its location's entity unless another is chosen, so the form fills it.
test("picking a location fills the restaurant's entity and GST details", async ({
  page,
  request,
}) => {
  const locations = await list<Location>(request, '/hospitals?isActive=true&limit=100');
  const entities = await list<Entity>(request, '/legal-entities?isActive=true&limit=100');
  const withEntity = locations.find((location) => location.legalEntityId);
  test.skip(!withEntity, 'no active location with an entity');

  await openNewRestaurant(page, 'all');
  const location = page.locator('#restaurant-location');
  const entity = page.locator('#restaurant-legal-entity');
  await location.selectOption(withEntity!.id);

  await expect(entity).toHaveValue(withEntity!.legalEntityId!);
  await expect(page.locator('#restaurant-gst')).toHaveValue(
    entities.find((option) => option.id === withEntity!.legalEntityId)?.gstNumber ?? '',
  );

  // Back to no location: the entity it brought leaves with it.
  await location.selectOption('');
  await expect(entity).toHaveValue('');
});

test("a location-scoped new restaurant starts with that location's entity", async ({
  page,
  request,
}) => {
  const locations = await list<Location>(request, '/hospitals?isActive=true&limit=100');
  const withEntity = locations.find((location) => location.legalEntityId);
  test.skip(!withEntity, 'no active location with an entity');

  await openNewRestaurant(page, withEntity!.id);

  await expect(page.locator('#restaurant-location')).toHaveValue(withEntity!.id);
  await expect(page.locator('#restaurant-legal-entity')).toHaveValue(withEntity!.legalEntityId!);
});
