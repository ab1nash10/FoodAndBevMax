import { strict as assert } from 'node:assert';
import { test, vi } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { recordNames } from './record-names';

test('each record type is looked up once, by its own name field', async () => {
  const posDevices = vi.fn(() => Promise.resolve([{ id: 'd1', name: 'LXF 3- East Block' }]));
  const items = vi.fn(() => Promise.resolve([{ id: 'i1', itemName: 'Masala Dosa' }]));
  const prisma = {
    item: { findMany: items },
    posDevice: { findMany: posDevices },
  } as unknown as PrismaService;

  const names = await recordNames(prisma, [
    { entityId: 'd1', entityName: 'pos_devices' },
    { entityId: 'd1', entityName: 'pos_devices' },
    { entityId: 'i1', entityName: 'items' },
    { entityId: 's1', entityName: 'auth_sessions' },
  ]);

  assert.equal(names.get('pos_devices:d1'), 'LXF 3- East Block');
  assert.equal(names.get('items:i1'), 'Masala Dosa');
  assert.equal(names.has('auth_sessions:s1'), false, 'no name for a sign-in session');
  assert.equal(posDevices.mock.calls.length, 1);
  assert.deepEqual((posDevices.mock.calls[0] as unknown as [{ where: object }])[0].where, {
    id: { in: ['d1'] },
  });
});
