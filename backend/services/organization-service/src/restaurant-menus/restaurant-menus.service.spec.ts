import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { MenuServeAt } from '@prisma/client';
import { test } from 'vitest';
import { assertPricesFor, assertWindow, menuDetails } from './restaurant-menus.service';

test('each place an item is served at needs its own price', () => {
  assert.doesNotThrow(() =>
    assertPricesFor({ price: 40, roomPrice: 60, serveAt: MenuServeAt.BOTH }),
  );
  assert.doesNotThrow(() => assertPricesFor({ price: 40, serveAt: MenuServeAt.COUNTER }));
  assert.doesNotThrow(() => assertPricesFor({ roomPrice: 60, serveAt: MenuServeAt.ROOM }));
  assert.doesNotThrow(() => assertPricesFor({ price: 0, roomPrice: 0, serveAt: MenuServeAt.BOTH }));

  assert.throws(
    () => assertPricesFor({ roomPrice: 60, serveAt: MenuServeAt.BOTH }),
    BadRequestException,
  );
  assert.throws(
    () => assertPricesFor({ price: 40, serveAt: MenuServeAt.BOTH }),
    BadRequestException,
  );
  assert.throws(
    () => assertPricesFor({ price: null, roomPrice: 60, serveAt: MenuServeAt.COUNTER }),
    BadRequestException,
  );
  assert.throws(
    () => assertPricesFor({ price: 40, serveAt: MenuServeAt.ROOM }),
    BadRequestException,
  );
});

test('an update only touches the fields it sends, and blank text clears a field', () => {
  assert.deepEqual(menuDetails({ itemId: 'x', price: 45, restaurantId: 'y' }), { price: 45 });
  assert.deepEqual(menuDetails({ addOn: '  ', accompaniments: ' Pickle ', roomPrice: null }), {
    accompaniments: 'Pickle',
    addOn: null,
    roomPrice: null,
  });
});

test('an on-sale window has both times or neither, and they differ', () => {
  assert.doesNotThrow(() => assertWindow({}));
  assert.doesNotThrow(() => assertWindow({ availableFrom: null, availableTo: null }));
  assert.doesNotThrow(() => assertWindow({ availableFrom: '07:00', availableTo: '10:30' }));
  // Ends before it starts: runs past midnight.
  assert.doesNotThrow(() => assertWindow({ availableFrom: '22:00', availableTo: '02:00' }));

  assert.throws(() => assertWindow({ availableFrom: '07:00' }), BadRequestException);
  assert.throws(
    () => assertWindow({ availableFrom: null, availableTo: '10:30' }),
    BadRequestException,
  );
  assert.throws(
    () => assertWindow({ availableFrom: '07:00', availableTo: '07:00' }),
    BadRequestException,
  );
});
