import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { nameKey, templateColumns } from './csv-import-export';

// yesNo, activeStatus and numberCell are covered in restaurant-menus-csv.test.ts.
test('names compare as the server does: no case, spaces, punctuation or accents', () => {
  assert.equal(nameKey('Soft Drinks'), nameKey('soft-drinks'));
  assert.equal(nameKey('Samosa!'), 'samosa');
  assert.equal(nameKey('Café Crème'), 'cafecreme');
  assert.equal(nameKey('  Veg   Thali (Large) '), 'vegthalilarge');
  assert.notEqual(nameKey('Thali 1'), nameKey('Thali 2'));
});

test('a template has the columns an import reads, with their rules, not the read-only ones', () => {
  assert.deepEqual(
    templateColumns([
      { header: 'Store code', hint: 'Blank adds one.', value: () => '' },
      {
        example: 'Main Store',
        header: 'Store name',
        hint: 'Up to 150.',
        required: true,
        value: () => '',
      },
      { header: 'Location', readOnly: true, value: () => '' },
    ]),
    [
      {
        example: '',
        field: 'Store code',
        header: 'Store code',
        hint: 'Blank adds one.',
        required: undefined,
      },
      {
        example: 'Main Store',
        field: 'Store name',
        header: 'Store name',
        hint: 'Up to 150.',
        required: true,
      },
    ],
  );
});
