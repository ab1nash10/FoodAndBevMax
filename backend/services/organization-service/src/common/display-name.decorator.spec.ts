import { strict as assert } from 'node:assert';
import { plainToInstance } from 'class-transformer';
import { test } from 'vitest';
import { CreateItemCategoryDto } from '../item-categories/dto/create-item-category.dto';
import { UpdateStoreDto } from '../stores/dto/update-store.dto';
import { CreateRestaurantDto } from '../restaurants/dto/create-restaurant.dto';

test('names are saved in Title Case and codes in capitals, on create and on update', () => {
  assert.equal(
    plainToInstance(CreateItemCategoryDto, { categoryName: '  soft drinks ' }).categoryName,
    'Soft Drinks',
  );
  // Update DTOs (PartialType) inherit the rules.
  const store = plainToInstance(UpdateStoreDto, {
    storeCode: ' str-04a ',
    storeName: 'MAIN STORE',
  });

  assert.equal(store.storeName, 'Main Store');
  assert.equal(store.storeCode, 'STR-04A');

  const restaurant = plainToInstance(CreateRestaurantDto, {
    bankName: 'hDFC bank',
    ifscCode: 'hdfc0001234',
    restaurantName: 'KFC express',
  });

  assert.equal(restaurant.restaurantName, 'KFC Express');
  assert.equal(restaurant.bankName, 'HDFC Bank');
  assert.equal(restaurant.ifscCode, 'HDFC0001234');
  // Left alone when absent.
  assert.equal(plainToInstance(UpdateStoreDto, {}).storeName, undefined);
});
