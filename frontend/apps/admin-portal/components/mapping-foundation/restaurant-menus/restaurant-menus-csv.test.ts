import assert from 'node:assert/strict';
import { test } from 'vitest';
import { activeStatus, numberCell, yesNo } from '@/components/csv-import-export';
import {
  daysCell,
  timeCell,
} from '@/components/mapping-foundation/restaurant-menus/restaurant-menus-csv';

test('menu import reads cells the way people and Excel write them', () => {
  assert.deepEqual(daysCell(''), []);
  assert.deepEqual(daysCell('Every day'), []);
  assert.deepEqual(daysCell('Monday, tue; WED, Monday'), ['MONDAY', 'TUESDAY', 'WEDNESDAY']);
  assert.throws(() => daysCell('Mo'), /not a day/);
  assert.throws(() => daysCell('Funday'), /not a day/);

  assert.equal(timeCell('', 'From'), null);
  assert.equal(timeCell('7:00', 'From'), '07:00');
  assert.equal(timeCell('22:30:00', 'From'), '22:30');
  assert.throws(() => timeCell('24:00', 'From'), /07:30/);
  assert.throws(() => timeCell('7 am', 'From'), /07:30/);

  assert.equal(yesNo('', true, 'Available'), true);
  assert.equal(yesNo('no', true, 'Available'), false);
  assert.throws(() => yesNo('maybe', true, 'Available'), /Yes or No/);
  assert.equal(activeStatus('inactive', true), false);
  assert.throws(() => activeStatus('off', true), /Active or Inactive/);

  assert.equal(numberCell('', 'Price', 2), null);
  assert.equal(numberCell('120.5', 'Price', 2), 120.5);
  assert.throws(() => numberCell('12.345', 'Price', 2), /two decimals|2 decimals/);
  assert.throws(() => numberCell('1.5', 'Serves'), /whole number/);
});
