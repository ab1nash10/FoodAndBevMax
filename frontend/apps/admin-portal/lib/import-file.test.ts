import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseCsv } from './csv';
import { maxImportRows, tableToImportRows, type ImportColumn } from './import-file';

const columns: ImportColumn[] = [
  { example: '', field: 'itemCode', header: 'Item code', hint: '' },
  { example: '', field: 'itemName', header: 'Item name', hint: '', required: true },
  { example: '', field: 'type', header: 'Food type', hint: '', required: true },
];

test('a CSV becomes rows keyed by field, whatever the column order or case', () => {
  const csv = [
    '﻿Food Type,ITEM NAME,Item code,Type',
    'Veg,"Rice, basmati",ITM0001,Packaged (stores)',
    'Non-veg,"6"" sub ",,',
    ',,,',
    'Egg,"Line',
    'break",,',
  ].join('\r\n');

  assert.deepEqual(tableToImportRows(parseCsv(csv), columns), [
    { itemCode: 'ITM0001', itemName: 'Rice, basmati', type: 'Veg' },
    { itemCode: '', itemName: '6" sub', type: 'Non-veg' },
    { itemCode: '', itemName: 'Line\r\nbreak', type: 'Egg' },
  ]);
});

test('a file the server would refuse is stopped with a reason', () => {
  assert.throws(
    () => tableToImportRows(parseCsv('Item name\nSamosa'), columns),
    /Missing column: Food type/,
  );
  assert.throws(() => tableToImportRows(parseCsv('Item name,Food type\n'), columns), /no rows/);

  const tooMany = [
    ['Item name', 'Food type'],
    ...Array.from({ length: maxImportRows + 1 }, () => ['Samosa', 'Veg']),
  ];

  assert.throws(() => tableToImportRows(tooMany, columns), /1,001 rows. Import up to 1,000/);
});
