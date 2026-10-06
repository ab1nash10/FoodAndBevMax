import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isKnownStatus, statusPresentation } from './status';
import { test } from 'vitest';

test('every schema status has a chip label and tone', () => {
  const schema = readFileSync(join(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
  const enums = [
    'GrnStatus',
    'KitchenProductionStatus',
    'TransferAcknowledgementStatus',
    'TransferStatus',
  ];

  for (const name of enums) {
    const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema)?.[1];

    assert.ok(block, `enum ${name} found in the schema`);

    for (const value of block.split(/\s+/).filter(Boolean)) {
      assert.ok(isKnownStatus(value), `${name}.${value} has a chip presentation`);
    }
  }

  assert.equal(statusPresentation('PENDING_ACKNOWLEDGEMENT').long, 'Pending acknowledgement');
  assert.equal(statusPresentation('REJECTED_FULL').tone, 'bad');
  assert.equal(statusPresentation('ACCEPTED_PARTIAL').tone, 'pending');
  assert.deepEqual(statusPresentation('SOMETHING_NEW'), {
    label: 'Something new',
    tone: 'neutral',
  });
});
