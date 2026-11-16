import { ValidateBy } from 'class-validator';

/**
 * No item twice, checked in linear time. class-validator's ArrayUnique compares every pair: a
 * long list in one request stalled the whole service (security audit run 2, 2026-11-14).
 */
export const UniqueItems = () =>
  ValidateBy({
    name: 'uniqueItems',
    validator: {
      defaultMessage: (args) => `All ${args?.property ?? ''}'s elements must be unique`,
      validate: (value: unknown) => !Array.isArray(value) || new Set(value).size === value.length,
    },
  });
