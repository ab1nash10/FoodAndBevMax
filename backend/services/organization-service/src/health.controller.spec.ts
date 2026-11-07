import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { HealthController } from './health.controller';

test('the health check is never rate-limited: load balancers and monitors call it all the time', () => {
  for (const throttler of ['default', 'address']) {
    assert.equal(Reflect.getMetadata(`THROTTLER:SKIP${throttler}`, HealthController), true);
  }
});
