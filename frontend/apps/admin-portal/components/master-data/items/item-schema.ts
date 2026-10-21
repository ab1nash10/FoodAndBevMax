'use client';

import { z } from 'zod';
import type { FoodType } from '@aahar/api-client';
import { optionalText } from '@/components/master-data/shared/schemas';
import { foodTypeValues } from '@/components/master-data/items/shared';

const foodTypeSchema = z.custom<FoodType>((value) => foodTypeValues.includes(value as FoodType), {
  message: 'Choose a food type.',
});

export const itemSchema = z.object({
  hsnCode: optionalText(50),
  isActive: z.boolean(),
  itemName: z
    .string()
    .trim()
    .min(1, 'Item name is required.')
    .max(255)
    .regex(/[A-Za-z0-9]/, 'Item name must include at least one letter or number.'),
  preparationTimeMinutes: z
    .string()
    .trim()
    .regex(/^$|^\d+$/, 'Use a whole number.')
    .transform((value) => (value ? Number(value) : undefined)),
  type: foodTypeSchema,
});
