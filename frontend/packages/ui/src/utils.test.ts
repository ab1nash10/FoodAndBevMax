import { strict as assert } from 'node:assert';
import { cn } from './utils';
import { test } from 'vitest';

test('cn merges the custom tokens', () => {
  assert.equal(cn('h-control', 'h-9'), 'h-9', 'a height override replaces the control height');
  assert.equal(cn('min-h-control', 'min-h-10'), 'min-h-10');
  assert.equal(cn('rounded-control', 'rounded-md'), 'rounded-md', 'radius tokens merge');
  assert.equal(cn('rounded-card', 'rounded-tile'), 'rounded-tile');
  assert.equal(cn('bg-ds-surface', 'bg-ds-subtle'), 'bg-ds-subtle', 'token colours merge');
  assert.equal(cn('border-ds-input', 'border-ds-border'), 'border-ds-border');
  assert.equal(cn('w-sidebar', 'w-24'), 'w-24');
  assert.equal(cn('max-w-content', 'max-w-md'), 'max-w-md');
  assert.equal(cn('px-3', 'h-control'), 'px-3 h-control', 'unrelated classes are kept');
});
