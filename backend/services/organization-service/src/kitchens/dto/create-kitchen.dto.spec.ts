import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, test } from 'vitest';
import { CreateKitchenDto } from './create-kitchen.dto';
import { UpdateKitchenDto } from './update-kitchen.dto';

const base = { hospitalId: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80', kitchenName: 'Main Kitchen' };
const failing = (
  body: Record<string, unknown>,
  dto: typeof CreateKitchenDto | typeof UpdateKitchenDto = CreateKitchenDto,
) => validateSync(plainToInstance(dto, { ...base, ...body })).map((error) => error.property);

describe('kitchen fields', () => {
  test('opening and closing times are 24-hour HH:mm', () => {
    expect(failing({ closingTime: '23:59', openingTime: '00:00' })).toEqual([]);
    expect(failing({ closingTime: '24:00', openingTime: '7:00' })).toEqual([
      'openingTime',
      'closingTime',
    ]);
  });

  test('the code is put in capitals, and an update may leave it out but not blank it', () => {
    expect(plainToInstance(CreateKitchenDto, { ...base, kitchenCode: ' kit0001 ' })).toMatchObject({
      kitchenCode: 'KIT0001',
    });
    expect(failing({}, UpdateKitchenDto)).toEqual([]);
    expect(failing({ kitchenCode: ' ' }, UpdateKitchenDto)).toEqual(['kitchenCode']);
  });
});
