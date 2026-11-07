import { expect, test } from '@playwright/test';
import { readSheet } from 'read-excel-file/node';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

const allOrNothing = /nothing is imported/i;
const rowByRow = /Rows are saved one at a time/;

// Every Import's template is an Excel file: the headers the import reads, then the rules.
const pages = [
  ['masters/items', 'items', 'items-import-template', 'Item name', allOrNothing],
  ['masters/employees', 'employees', 'employees-import-template', 'Employee code', allOrNothing],
  ['masters/restaurant-menus', 'menu items', 'menu-prices-import-template', 'Price', allOrNothing],
  ['masters/locations', 'locations', 'locations-import-template', 'Invoice prefix', rowByRow],
  ['masters/entities', 'entities', 'entities-import-template', 'GST number', rowByRow],
  ['masters/stores', 'stores', 'stores-import-template', 'Store name', rowByRow],
  ['masters/kitchens', 'kitchens', 'kitchens-import-template', 'Kitchen name', rowByRow],
  [
    'masters/item-categories',
    'item categories',
    'item-categories-import-template',
    'Category name',
    rowByRow,
  ],
] as const;

for (const [path, noun, filename, column, outcome] of pages) {
  test(`${noun} import downloads an Excel template with its rules`, async ({ page }) => {
    page.setDefaultTimeout(30_000);
    await page.goto(path);
    await page.getByRole('button', { exact: true, name: 'Import' }).click();
    const panel = page.getByRole('dialog', { name: `Import ${noun}` });
    await expect(panel).toBeVisible();
    // The panel lists the rules before a file is chosen.
    // A term, as a required one also holds its required mark.
    await expect(panel.getByRole('term').filter({ hasText: new RegExp(`^${column}`) })).toBeVisible();
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Download Excel template' }).click();
    const file = await download;

    expect(file.suggestedFilename()).toBe(`${filename}.xlsx`);
    const filePath = await file.path();
    expect((await readSheet(filePath))[0]).toContain(column);
    const rules = (await readSheet(filePath, 'Instructions')).flat().join('\n');
    expect(rules).toContain(column);
    expect(rules).toMatch(outcome);
  });
}
