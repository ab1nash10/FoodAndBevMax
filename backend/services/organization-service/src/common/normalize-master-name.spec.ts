import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { normalizeMasterName } from './normalize-master-name';

test('two names are the same item whatever their case, spacing or punctuation', () => {
  assert.equal(normalizeMasterName('Coffee'), normalizeMasterName('coffee'));
  assert.equal(normalizeMasterName('Masala Chai'), normalizeMasterName('masala-chai'));
});
