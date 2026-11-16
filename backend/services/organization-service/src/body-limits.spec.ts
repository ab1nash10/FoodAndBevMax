import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { isImport } from './body-limits';

const post = (url: string) => ({ headers: {}, method: 'POST', url });

test('only the import routes and the ERP GRN route get the large body limit', () => {
  for (const url of [
    '/api/v1/items/import',
    '/fandb/api/v1/employees/import/',
    '/api/v1/restaurant-menus/import?dryRun=true',
    '/fandb/api/v1/erp/grns',
  ]) {
    assert.equal(isImport(post(url)), true, url);
  }
  assert.equal(isImport({ headers: {}, method: 'GET', url: '/api/v1/items/import' }), false);
});

test('a query string naming an import route does not buy any other route the large limit', () => {
  for (const url of [
    '/api/v1/pos-devices?x=/api/v1/erp/grns',
    '/fandb/api/v1/restaurants?x=/api/v1/items/import',
    '/api/v1/restaurant-menus?/api/v1/erp/grns',
    '/api/v1/employee-discounts#/api/v1/erp/grns',
  ]) {
    assert.equal(isImport(post(url)), false, url);
  }
});
