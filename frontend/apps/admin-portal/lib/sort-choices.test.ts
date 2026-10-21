import { expect, test } from 'vitest';
import { sortChoices } from './sort-choices';

test('each sort field becomes two plain choices, the useful direction first', () => {
  expect(
    sortChoices([
      { label: 'Created date', value: 'createdAt' },
      { label: 'Updated date', value: 'updatedAt' },
      { label: 'Expiry date', value: 'expiryDate' },
      { label: 'Business date', value: 'businessDate' },
      { label: 'Available qty', value: 'availableQty' },
      { label: 'Status', value: 'isActive' },
      { label: 'Discount eligible', value: 'eligibleForDiscount' },
      { label: 'Name', value: 'storeName' },
    ]).map((choice) => `${choice.value} ${choice.label}`),
  ).toEqual([
    'createdAt:desc Newest first',
    'createdAt:asc Oldest first',
    'updatedAt:desc Recently updated',
    'updatedAt:asc Least recently updated',
    'expiryDate:asc Expiring soonest',
    'expiryDate:desc Expiring last',
    'businessDate:desc Business date, newest first',
    'businessDate:asc Business date, oldest first',
    'availableQty:desc Most available',
    'availableQty:asc Least available',
    'isActive:desc Active first',
    'isActive:asc Inactive first',
    'eligibleForDiscount:desc Discount eligible first',
    'eligibleForDiscount:asc Discount eligible last',
    'storeName:asc Name A–Z',
    'storeName:desc Name Z–A',
  ]);
});
