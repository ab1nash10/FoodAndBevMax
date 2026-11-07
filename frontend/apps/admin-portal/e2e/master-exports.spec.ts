import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

// Each master's Export downloads a CSV whose header row is what its Import reads back.
const pages = [
  ['masters/locations', 'locations', 'Location code,Title,Display name'],
  ['masters/entities', 'entities', 'GST number,Location name,Entity name'],
  ['masters/stores', 'stores', 'Store code,Store name,Location code'],
  ['masters/kitchens', 'kitchens', 'Kitchen code,Kitchen name,Location code'],
  ['masters/employees', 'employees', 'Employee code,Employee name,Employment type'],
] as const;

for (const [path, name, header] of pages) {
  test(`${name} export downloads with the import's columns`, async ({ page }) => {
    page.setDefaultTimeout(30_000);
    await page.goto(path);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { exact: true, name: 'Export' }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(new RegExp(`^${name}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
    expect(readFileSync(await file.path(), 'utf8').trimStart()).toMatch(
      new RegExp(`^"?${header.replaceAll(',', '"?,"?')}`),
    );
  });
}
