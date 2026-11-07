import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

type Location = { id: string; legalEntityId: string | null };
type Employee = {
  birthDate: string | null;
  employeeCode: string;
  employeeName: string;
  gender: string | null;
  id: string;
  legalEntityId: string | null;
  officialEmail: string | null;
  reportingManager: { id: string } | null;
};

function token() {
  const session = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };

  return (JSON.parse(session.origins[0]?.localStorage[0]?.value ?? '{}') as { accessToken: string })
    .accessToken;
}

async function call<T>(request: APIRequestContext, method: 'DELETE' | 'GET', path: string) {
  const response = await request.fetch(`${organizationApi}${path}`, {
    headers: { authorization: `Bearer ${token()}` },
    method,
  });

  return ((await response.json()) as { data: T }).data;
}

async function openNewEmployee(page: Page) {
  page.setDefaultTimeout(30_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('aahar.location-context', 'all');
  });
  await page.goto('masters/employees/new');
  await expect(page.locator('#employee-entity')).toBeEnabled();
}

test("picking a location fills the employee's entity", async ({ page, request }) => {
  const locations = await call<{ items: Location[] }>(
    request,
    'GET',
    '/hospitals?isActive=true&limit=100',
  );
  const withEntity = locations.items.find((location) => location.legalEntityId);
  test.skip(!withEntity, 'no active location with an entity');

  await openNewEmployee(page);
  const entity = page.locator('#employee-entity');
  await page.locator('#employee-location').selectOption(withEntity!.id);
  await expect(entity).toHaveValue(withEntity!.legalEntityId!);

  // Back to shared: the entity it brought leaves with it.
  await page.locator('#employee-location').selectOption('');
  await expect(entity).toHaveValue('');
});

test('an employee saved without a code gets one, with every detail and a picked manager', async ({
  page,
  request,
}) => {
  const others = await call<{ items: Employee[] }>(
    request,
    'GET',
    '/employees?isActive=true&limit=1',
  );
  const manager = others.items[0];
  test.skip(!manager, 'no active employee to report to');
  const name = `E2E Employee ${Date.now()}`;

  await openNewEmployee(page);
  await page.locator('#employee-name').fill(name);
  await page.locator('#employee-email').fill('e2e.employee@example.com');
  await page.locator('#employee-birth-date').fill('1990-04-12');
  await page.locator('#employee-joining-date').fill('2024-01-15');
  await page.getByLabel('Off-Role').check();
  await page.getByLabel('Female').check();
  await page.locator('#employee-level').fill('L2');
  await page.locator('#employee-manager').fill(manager!.employeeCode);
  // Exactly the search result's name: the list under the panel has buttons naming them too.
  await page
    .getByRole('button', {
      exact: true,
      name: `${manager!.employeeName} (${manager!.employeeCode})`,
    })
    .click();
  await expect(page.locator('#employee-manager')).toHaveValue(
    `${manager!.employeeName} (${manager!.employeeCode})`,
  );
  await page.getByRole('button', { name: 'Create Employee' }).click();
  // Saved, the page goes to the new employee in the list (the toast may be gone by then).
  await expect(page).toHaveURL(/masters\/employees($|\?)/);

  const saved = (
    await call<{ items: Employee[] }>(
      request,
      'GET',
      `/employees?search=${encodeURIComponent(name)}`,
    )
  ).items[0];

  try {
    expect(saved).toMatchObject({
      birthDate: '1990-04-12',
      employeeCode: expect.stringMatching(/^EMP\d{4,}$/),
      gender: 'FEMALE',
      officialEmail: 'e2e.employee@example.com',
      reportingManager: { id: manager!.id },
    });
  } finally {
    if (saved) await call(request, 'DELETE', `/employees/${saved.id}`);
  }
});
