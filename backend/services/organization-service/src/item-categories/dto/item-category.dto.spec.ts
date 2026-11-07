import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, test } from 'vitest';
import { CreateItemCategoryDto } from './create-item-category.dto';
import { ReorderItemCategoriesDto } from './reorder-item-categories.dto';

const failing = <T extends object>(dto: new () => T, body: Record<string, unknown>) =>
  validateSync(plainToInstance(dto, body)).map((error) => error.property);

describe('item category fields', () => {
  test('a name needs at least one letter or number', () => {
    expect(failing(CreateItemCategoryDto, { categoryName: 'Hot Beverages' })).toEqual([]);
    expect(failing(CreateItemCategoryDto, { categoryName: '--- !' })).toEqual(['categoryName']);
    expect(failing(CreateItemCategoryDto, { categoryName: '' })).toEqual(['categoryName']);
  });

  test('a reorder lists each category id once', () => {
    const a = '8f1e2b8c-1a4d-4e2f-9b3c-2d4e6f8a0b1c';
    const b = '3c2b1a0f-9e8d-4c7b-8a6f-5e4d3c2b1a0f';

    expect(failing(ReorderItemCategoriesDto, { ids: [a, b] })).toEqual([]);
    expect(failing(ReorderItemCategoriesDto, { ids: [] })).toEqual(['ids']);
    expect(failing(ReorderItemCategoriesDto, { ids: [a, a] })).toEqual(['ids']);
    expect(failing(ReorderItemCategoriesDto, { ids: ['not-an-id'] })).toEqual(['ids']);
  });
});
