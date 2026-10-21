import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateItemDto } from './update-item.dto';

const check = (body: object) => {
  const dto = plainToInstance(UpdateItemDto, body);

  return { dto, errors: validateSync(dto).map((error) => error.property) };
};

describe('UpdateItemDto', () => {
  it('lets an edit clear the optional HSN code and preparation time with null', () => {
    const { dto, errors } = check({ hsnCode: null, preparationTimeMinutes: null });

    expect(errors).toEqual([]);
    expect(dto.hsnCode).toBeNull();
    expect(dto.preparationTimeMinutes).toBeNull();
  });

  it('refuses to blank the required item name', () => {
    expect(check({ itemName: '   ' }).errors).toContain('itemName');
  });
});
