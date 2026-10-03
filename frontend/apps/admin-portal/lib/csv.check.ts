// Self-check for toCsv: pnpm exec tsx lib/csv.check.ts
import assert from 'node:assert/strict';
import { toCsv } from './csv';

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

console.log('csv ok');
