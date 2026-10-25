import assert from 'node:assert/strict';
import { test } from 'vitest';
import { discardProblem, discardRemarks } from './stock-discard';

test('a discard may take up to what the batch holds, never more', () => {
  assert.equal(discardProblem(5, 5), null);
  assert.equal(discardProblem(5, 2.5), null);
  assert.equal(discardProblem(0.3, 0.1 + 0.2), null);
  assert.match(discardProblem(5, 5.001) ?? '', /Only 5 left/);
  assert.match(discardProblem(5, 0) ?? '', /above zero/);
});

test('the ledger remarks say why, with the note when one was given', () => {
  assert.equal(discardRemarks('EXPIRED'), 'Discarded: Expired');
  assert.equal(discardRemarks('DAMAGED', '  tin dented '), 'Discarded: Damaged: tin dented');
  assert.equal(discardRemarks('OTHER', ''), 'Discarded: Other');
});
