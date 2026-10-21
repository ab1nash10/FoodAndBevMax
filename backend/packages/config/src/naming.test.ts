import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeCase, titleCase } from './naming';

void test('names follow Title Case, keeping acronyms', () => {
  const cases: Array<[string, string]> = [
    ['MAX HEALTHCARE INSTITUTE LIMITED', 'Max Healthcare Institute Limited'],
    [
      'DR. B. L. KAPUR MEMORIAL HOSPITAL (A Unit of Lahore Hospital Society)',
      'Dr. B. L. Kapur Memorial Hospital (A Unit of Lahore Hospital Society)',
    ],
    ['Hometrail Buildtech Pvt. LTD.', 'Hometrail Buildtech Pvt. Ltd.'],
    [
      'Balaji Medical and Diagnostic Research centre',
      'Balaji Medical and Diagnostic Research Centre',
    ],
    ['SHALIMAR BAGH', 'Shalimar Bagh'],
    ['MAX-BLK', 'Max-BLK'],
    ['MAX-PATPARGANJ', 'Max-Patparganj'],
    ['IMM PPN', 'IMM PPN'],
    ['MSSH SKT', 'MSSH SKT'],
    ['veg thali', 'Veg Thali'],
    ['  red   bull energy drink ', 'Red Bull Energy Drink'],
    ['the hospital of hope', 'The Hospital of Hope'],
    ["McDonald's corner", "McDonald's Corner"],
    ['POS Cashier', 'POS Cashier'],
    ['7up', '7up'],
    ['', ''],
  ];

  for (const [input, expected] of cases) {
    assert.equal(titleCase(input), expected, input);
  }

  // Already tidy names are left exactly as they are.
  assert.equal(
    titleCase(titleCase('MAX HEALTHCARE INSTITUTE LIMITED')),
    'Max Healthcare Institute Limited',
  );
});

void test('codes are upper case', () => {
  assert.equal(codeCase(' Max-02 '), 'MAX-02');
  assert.equal(codeCase('hsn3459i'), 'HSN3459I');
});
