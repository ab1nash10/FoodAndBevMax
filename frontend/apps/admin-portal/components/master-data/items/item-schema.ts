'use client';

import { z } from 'zod';
import type { FoodType, ItemType } from '@aahar/api-client';
import { itemTypeValues } from '@/components/master-data/shared/utils';
import { optionalText } from '@/components/master-data/shared/schemas';
import { foodTypeValues } from '@/components/master-data/items/shared';

const foodTypeSchema = z.custom<FoodType>((value) => foodTypeValues.includes(value as FoodType), {
  message: 'Select type.',
});

const itemTypeSchema = z.custom<ItemType>((value) => itemTypeValues.includes(value as ItemType), {
  message: 'Select item type.',
});

export const itemSchema = z.object({
  categoryId: z.string().uuid('Select a category.'),
  hospitalId: z.string(),
  hsnCode: optionalText(50),
  isActive: z.boolean(),
  itemName: z.string().trim().min(1, 'Item name is required.').max(255),
  itemType: itemTypeSchema,
  preparationTimeMinutes: z
    .string()
    .trim()
    .regex(/^$|^\d+$/, 'Use a whole number.')
    .transform((value) => (value ? Number(value) : undefined)),
  type: foodTypeSchema,
});
