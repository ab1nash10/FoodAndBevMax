import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

type Location = { id: string; legalEntityId: string | null };
type Entity = { entityAddress: string; id: string; locationName: string | null };

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

// A location is named by its entity's Location column, on the list and in the form.
test("the Locations list names each location by its entity's location", async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  const entities = await list<Entity>(request, '/legal-entities?limit=100');
  const locations = await list<Location>(request, '/hospitals?limit=100');
  const named = locations
    .map((location) => ({
      id: location.id,
      name: entities.find((entity) => entity.id === location.legalEntityId)?.locationName,
    }))
    .find((location) => location.name);
  test.skip(!named, 'no location whose entity has a location name');

  await page.goto('masters/locations');
  const row = page.locator(`tr[data-record-id="${named!.id}"]`);
  await expect(row.locator('td').first().locator('p').first()).toHaveText(named!.name!);
});

test("the entity is picked first, and fills the new location's title and address", async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  const entity = (await list<Entity>(request, '/legal-entities?isActive=true&limit=100')).find(
    (option) => option.locationName,
  );
  test.skip(!entity, 'no active entity with a location name');

  await page.goto('masters/locations/new');
  // The first field of the form: the rest follows from it.
  await expect(page.locator('main form :is(input, select, textarea)').first()).toHaveId(
    'location-legal-entity',
  );
  await expect(page.locator('#location-legal-entity')).toBeEnabled();
  await page.locator('#location-legal-entity').selectOption(entity!.id);

  await expect(page.locator('#location-title')).toHaveValue(entity!.locationName!);
  await expect(page.locator('#location-address')).toHaveValue(entity!.entityAddress);
});
