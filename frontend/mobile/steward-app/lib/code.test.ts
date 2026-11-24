import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeFromScan } from './code.ts';

test("reads the six digits from a guest's delivery QR, and nothing from any other QR", () => {
  assert.equal(codeFromScan('fandb-delivery:482913'), '482913');
  assert.equal(codeFromScan(' fandb-delivery:004213 '), '004213');
  // Not a delivery QR: a bed's ordering QR, a payment, a stray number.
  assert.equal(codeFromScan('https://fandb.example/order/room/abc'), null);
  assert.equal(codeFromScan('upi://pay?pa=max@upi&am=210'), null);
  assert.equal(codeFromScan('482913'), null);
  assert.equal(codeFromScan('fandb-delivery:48291'), null);
});
