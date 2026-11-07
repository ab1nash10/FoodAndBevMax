import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { itemsLabel, qty, total } from './audit-summary';

test('a summary names the item when every line is the same one, else counts them', () => {
  assert.equal(itemsLabel([{ itemName: 'Basmati' }, { itemName: 'Basmati' }]), 'Basmati');
  assert.equal(itemsLabel([{ itemName: 'Basmati' }, { itemName: 'Dal' }]), '2 items');
  assert.equal(itemsLabel([{ itemName: null }]), '1 item');
});

test('quantities read as people write them', () => {
  assert.equal(qty(18), '18');
  assert.equal(qty(2.5), '2.5');
  assert.equal(qty(0.1 + 0.2), '0.3');
  assert.equal(total([1.5, 2, 0.25]), 3.75);
});
