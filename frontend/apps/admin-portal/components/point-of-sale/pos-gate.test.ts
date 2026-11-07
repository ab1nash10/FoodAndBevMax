import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { tillElsewhere } from './pos-gate';

const locations = [
  { hospitalName: 'Max-Smart', id: 'smart' },
  { hospitalName: 'Max-Blk', id: 'blk' },
];

test('the POS opens only for a till at the location picked in the portal', () => {
  // All locations picked, or the till's own: it opens.
  assert.equal(tillElsewhere(['smart'], undefined, locations), null);
  assert.equal(tillElsewhere(['smart'], 'smart', locations), null);

  assert.equal(
    tillElsewhere(['smart'], 'blk', locations),
    'This till is at Max-Smart, and you have Max-Blk picked. Pick Max-Smart at the top to use the POS here.',
  );
});
