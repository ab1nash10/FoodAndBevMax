import { strict as assert } from 'node:assert';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { test } from 'vitest';
import { UpdateItemPriceDto } from './update-item-price.dto';

test('an edit may send a null GST rate to clear it, but not a rate outside 0, 5, 12 and 18', () => {
  const dto = plainToInstance(UpdateItemPriceDto, { gstPercent: null });

  assert.equal(dto.gstPercent, null);
  assert.deepEqual(validateSync(dto), []);
  assert.equal(validateSync(plainToInstance(UpdateItemPriceDto, { gstPercent: 28 })).length, 1);
});
