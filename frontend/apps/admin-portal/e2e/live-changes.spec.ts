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

async function api(request: APIRequestContext, method: 'GET' | 'PUT', path: string, data?: object) {
  const response = await request.fetch(`${organizationApi}${path}`, {
    data,
    headers: { authorization: `Bearer ${token()}` },
    method,
  });
  expect(response.ok(), `${method} ${path}: ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: { items: unknown[] } }).data;
}

type Location = { hospitalName: string; id: string; legalEntityId: string | null };
type Entity = { id: string; locationName: string | null };

// A save made elsewhere (here, straight through the API, as another admin's screen would) shows
// on an open screen at once: no reload, and well inside the 5 minutes it would otherwise wait.
test('a location renamed elsewhere is renamed in an open screen within seconds', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  const locations = (await api(request, 'GET', '/hospitals?isActive=true&limit=100'))
    .items as Location[];
  const entities = (await api(request, 'GET', '/legal-entities?limit=100')).items as Entity[];
  // Header name = the entity's Location, else the location's own title: rename whichever it is.
  const target = locations
    .map((location) => ({
      entity: entities.find((entity) => entity.id === location.legalEntityId),
      location,
    }))
    .map(({ entity, location }) =>
      entity?.locationName
        ? { field: 'locationName', name: entity.locationName, path: `/legal-entities/${entity.id}` }
        : { field: 'title', name: location.hospitalName, path: `/hospitals/${location.id}` },
    )[0];
  test.skip(!target, 'no active location');
  const renamed = `${target!.name} Live`;

  await page.goto('masters/locations');
  await page.getByRole('button', { name: /^Select a location\./ }).click();
  await expect(page.getByText(target!.name, { exact: true }).first()).toBeVisible();

  try {
    await api(request, 'PUT', target!.path, { [target!.field]: renamed });
    await expect(page.getByText(renamed, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
  } finally {
    await api(request, 'PUT', target!.path, { [target!.field]: target!.name });
  }
});

// A refresh may update a form only while it is untouched: someone typing keeps what they typed.
test('a save elsewhere does not wipe a location form someone is editing', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  const location = (
    (await api(request, 'GET', '/hospitals?isActive=true&limit=100')).items as Location[]
  )[0];
  test.skip(!location, 'no active location');
  const area = (await api(request, 'GET', `/hospitals/${location!.id}`)) as unknown as {
    area: string | null;
  };

  await page.goto(`masters/locations/${location!.id}/edit`);
  const displayName = page.locator('#location-display-name');
  await expect(displayName).toBeEnabled();
  await displayName.fill('Typed but not saved');

  try {
    // Another admin saves the same location.
    await api(request, 'PUT', `/hospitals/${location!.id}`, { area: 'Live area' });
    // The refresh lands within about a second; give it three.
    await page.waitForTimeout(3_000);
    await expect(displayName).toHaveValue('Typed but not saved');
  } finally {
    await api(request, 'PUT', `/hospitals/${location!.id}`, { area: area.area ?? '' });
  }
});
