import assert from 'node:assert/strict';
import { parseCsv, toCsv } from './csv';
import { test } from 'vitest';

test('toCsv', () => {
  assert.equal(
    toCsv([
      ['a', 1],
      ['b', 2],
    ]),
    'a,1\r\nb,2',
  );
  assert.equal(toCsv([['Rice, basmati']]), '"Rice, basmati"');
  assert.equal(toCsv([['6" plate']]), '"6"" plate"');
  assert.equal(toCsv([['line\nbreak']]), '"line\nbreak"');
  assert.equal(toCsv([['=HYPERLINK("x")']]), `"'=HYPERLINK(""x"")"`);
  assert.equal(toCsv([['+91 98765'], ['-5'], ['@sum']]), "'+91 98765\r\n'-5\r\n'@sum");
  assert.equal(toCsv([[-5]]), "'-5");
});

test('parseCsv reads back what toCsv writes', () => {
  const rows = [
    ['Name', 'Note', 'Qty'],
    ['Rice, basmati', '6" plate', '-5'],
    ['=HYPERLINK("x")', 'line\nbreak', ''],
    ["it's", '+91 98765', '@sum'],
  ];

  assert.deepEqual(parseCsv(`${String.fromCharCode(0xfeff)}${toCsv(rows)}`), rows);
});

test('parseCsv takes Excel-style files', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n\n3,4\n'), [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
  ]);
  assert.deepEqual(parseCsv('a,b\r\n,\r\n'), [['a', 'b']], 'a row of empty cells is skipped');
});
