import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * The History button on a GRN, a transfer and a kitchen production opens the side panel with
 * that record's changes. Read-only: it picks records that already have history (any record if
 * none has), opens them and the panel, and changes nothing.
 */
const documents = [
  { entityName: 'grns', list: 'grns', page: 'inventory/grns' },
  { entityName: 'transfers', list: 'transfers', page: 'inventory/transfers' },
  { entityName: 'kitchen_productions', list: 'kitchen-productions', page: 'kitchen/productions' },
];
const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

async function get(path: string): Promise<{ items: Record<string, unknown>[] }> {
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
  return ((await response.json()) as { data: { items: Record<string, unknown>[] } }).data;
}

/** A record with history if there is one; otherwise any record, or null when there are none. */
async function recordToOpen(entityName: string, list: string) {
  const [audited] = (await get(`/audit-logs?entityName=${entityName}&limit=1`)).items;
  if (audited) return { hasHistory: true, id: String(audited.entityId) };
  const [any] = (await get(`/${list}?limit=1`)).items;
  return any ? { hasHistory: false, id: String(any.id) } : null;
}

/** Uncaught errors and API calls answered 4xx/5xx while `act` runs. */
async function problemsWhile(page: Page, act: () => Promise<void>): Promise<string[]> {
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
    await act();
  } finally {
    page.off('pageerror', onError);
    page.off('response', onResponse);
  }
  return problems;
}

// One test, one signed-in tab (see record-panels.spec.ts: separate contexts sign each other out).
test('the History panel opens on a GRN, a transfer and a kitchen production', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  // The dev server compiles a route on its first visit.
  page.setDefaultTimeout(90_000);

  for (const document of documents) {
    await test.step(document.page, async () => {
      const record = await recordToOpen(document.entityName, document.list);
      test.skip(!record, `no ${document.entityName} in this database to open`);

      const problems = await problemsWhile(page, async () => {
        await page.goto(`${document.page}?id=${record!.id}`);
        const history = page.getByRole('button', { name: /^History of / });
        await history.click();

        const panel = page.getByRole('dialog', { name: /^History · / });
        await expect(panel).toBeVisible();
        await expect(panel.getByRole('status', { name: 'Loading history' })).toHaveCount(0);
        await expect(panel.getByRole('alert')).toHaveCount(0);
        if (record!.hasHistory) {
          await expect(
            panel.getByRole('list', { name: 'Changes, newest first' }).getByRole('listitem'),
          ).not.toHaveCount(0);
        } else {
          await expect(
            panel.getByText('Nothing has been recorded for this record yet.'),
          ).toBeVisible();
        }

        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
      });
      expect.soft(problems, document.page).toEqual([]);
    });
  }
});
