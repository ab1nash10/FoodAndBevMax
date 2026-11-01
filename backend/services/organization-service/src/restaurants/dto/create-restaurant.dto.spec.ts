import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, test } from 'vitest';
import { CreateRestaurantDto } from './create-restaurant.dto';
import { UpdateRestaurantDto } from './update-restaurant.dto';

const base = { hospitalId: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80', restaurantName: 'Cafe' };
const failing = (
  body: Record<string, unknown>,
  dto: typeof CreateRestaurantDto | typeof UpdateRestaurantDto = CreateRestaurantDto,
) => validateSync(plainToInstance(dto, { ...base, ...body })).map((error) => error.property);

describe('restaurant fields', () => {
  test('only the location and the name are required', () => {
    expect(failing({})).toEqual([]);
    expect(failing({ restaurantName: '  ' })).toEqual(['restaurantName']);
    expect(failing({ hospitalId: undefined })).toEqual(['hospitalId']);
  });

  test('GST, PAN, IFSC and mobile are checked when given; codes in any case are put in capitals', () => {
    const body = {
      gstNumber: ' 07aadcm0815b1zq ',
      ifscCode: 'hdfc0001234',
      mobile: '9876543210',
      panNumber: 'aadcm0815b',
    };

    expect(failing(body)).toEqual([]);
    expect(plainToInstance(CreateRestaurantDto, body)).toMatchObject({
      gstNumber: '07AADCM0815B1ZQ',
      ifscCode: 'HDFC0001234',
      panNumber: 'AADCM0815B',
    });
    expect(
      failing({
        gstNumber: 'GST123456',
        ifscCode: 'HDFC1234',
        mobile: '+91 98765',
        panNumber: 'X',
      }),
    ).toEqual(['mobile', 'gstNumber', 'panNumber', 'ifscCode']);
  });

  test('an update may leave the code out but not blank it', () => {
    expect(failing({}, UpdateRestaurantDto)).toEqual([]);
    expect(failing({ restaurantCode: ' ' }, UpdateRestaurantDto)).toEqual(['restaurantCode']);
  });

  test('an update may clear any optional text field with null', () => {
    const cleared = Object.fromEntries(
      [
        'accountNumber',
        'address',
        'bankNameBranch',
        'email',
        'fssaiNumbers',
        'gstAddress',
        'gstNumber',
        'ifscCode',
        'legalName',
        'mobile',
        'panNumber',
        'sodexoMid',
        'sodexoTid',
        'sunBu',
        'sunT1',
        'sunT2',
        'unitNameForQr',
        'upiId',
      ].map((field) => [field, null]),
    );

    expect(failing(cleared, UpdateRestaurantDto)).toEqual([]);
  });

  test('an image is one the portal uploaded', () => {
    for (const url of [
      '/uploads/restaurants/1730000000000-0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.webp',
      '/uploads/restaurants/1730000000000-0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.jpg',
    ]) {
      expect(failing({ coverImageUrl: url, thumbnailUrl: url })).toEqual([]);
      expect(failing({ coverImageUrl: url, thumbnailUrl: url }, UpdateRestaurantDto)).toEqual([]);
    }

    for (const url of [
      // The portal's CSP loads images from its own origin only (next.config.ts img-src).
      'https://cdn.example.com/cafe.jpg',
      'javascript:alert(1)',
      'http://example.com/cafe.jpg',
      'data:image/png;base64,AAAA',
      '//evil.example/cafe.jpg',
      '/uploads/restaurants/../../api/v1/users',
      '/fandb/api/v1/users/me',
      'https://example.com/a.jpg") , url("https://evil.example/x',
    ]) {
      expect(failing({ coverImageUrl: url, thumbnailUrl: url })).toEqual([
        'thumbnailUrl',
        'coverImageUrl',
      ]);
      expect(failing({ thumbnailUrl: url }, UpdateRestaurantDto)).toEqual(['thumbnailUrl']);
    }
  });
});
