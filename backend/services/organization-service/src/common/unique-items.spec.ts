import { strict as assert } from 'node:assert';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { test } from 'vitest';
import { CreateEmployeeDiscountDto } from '../employee-discounts/dto/employee-discount.dto';
import { CreatePosDeviceDto } from '../pos-devices/dto/create-pos-device.dto';
import { CreateRestaurantMenuDto } from '../restaurant-menus/dto/create-restaurant-menu.dto';
import { CreateRestaurantDto } from '../restaurants/dto/create-restaurant.dto';
import { UniqueItems } from './unique-items';

class Holder {
  @UniqueItems()
  values!: unknown[];
}

const errorsOn = (values: unknown[]) =>
  validateSync(plainToInstance(Holder, { values })).map((error) => error.property);

test('repeated items are refused, distinct ones pass', () => {
  assert.deepEqual(errorsOn(['a', 'b', 'c']), []);
  assert.deepEqual(errorsOn(['a', 'b', 'a']), ['values']);
  assert.deepEqual(errorsOn([]), []);
});

test('a huge list is checked in linear time, not one compare per pair', () => {
  // class-validator's own ArrayUnique took seconds on lists this size and stalled the service.
  const values = Array.from({ length: 200_000 }, (_, index) => `value-${index}`);
  const started = performance.now();
  assert.deepEqual(errorsOn(values), []);
  assert.ok(performance.now() - started < 1_000, 'checking 200,000 items took over a second');
});

test('list fields on location masters are capped and checked without the quadratic rule', () => {
  const ids = Array.from({ length: 1_001 }, () => crypto.randomUUID());
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const failing = (dto: new () => object, body: object, field: string) =>
    validateSync(plainToInstance(dto, body)).some(
      (error) => error.property === field && 'arrayMaxSize' in (error.constraints ?? {}),
    );

  assert.ok(failing(CreatePosDeviceDto, { restaurantIds: ids }, 'restaurantIds'));
  assert.ok(failing(CreateRestaurantDto, { kitchenIds: ids }, 'kitchenIds'));
  assert.ok(failing(CreateRestaurantMenuDto, { daysOfWeek: [...days, 'MONDAY'] }, 'daysOfWeek'));
  assert.ok(failing(CreateEmployeeDiscountDto, { daysOfWeek: [...days, 'MONDAY'] }, 'daysOfWeek'));
});
