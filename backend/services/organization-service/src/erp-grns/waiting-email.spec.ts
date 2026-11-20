import { expect, test } from 'vitest';
import { waitingReverseEmail } from './erp-grns.service';

test('the email names the GRN, each waiting batch and where it is held, per restaurant', () => {
  const { html, subject } = waitingReverseEmail({
    batches: [
      {
        batch: '10101',
        holders: [
          { name: 'Int Café', qty: 150 },
          { name: 'Counter 2', qty: 50 },
        ],
        itemCode: 'ITM0001',
        itemName: 'Coke 300 ml',
        waiting: 200,
      },
    ],
    grnNumber: 'GRN-724630',
    locationName: 'Max Saket',
    transactionNumber: '51bb2947-7cf1-4710-9ed5-5de6e0968881',
  });

  expect(subject).toBe('GRN reverse GRN-724630 at Max Saket is waiting for 200 to come back');
  for (const text of [
    'GRN-724630',
    '51bb2947-7cf1-4710-9ed5-5de6e0968881',
    'Coke 300 ml',
    'ITM0001',
    '10101',
    '200',
    'Int Café',
    '150',
    'Counter 2',
    '50',
  ]) {
    expect(html).toContain(text);
  }
});

test('names are escaped, and a batch held nowhere says so', () => {
  const { html } = waitingReverseEmail({
    batches: [{ batch: '<b>', holders: [], itemCode: 'X&Y', itemName: null, waiting: 1 }],
    grnNumber: 'G1',
    locationName: 'Site',
    transactionNumber: 't',
  });

  expect(html).toContain('&lt;b&gt;');
  expect(html).toContain('X&amp;Y');
  expect(html).not.toContain('"><b></td>');
  expect(html).toContain('Not found in any restaurant or counter');
});
