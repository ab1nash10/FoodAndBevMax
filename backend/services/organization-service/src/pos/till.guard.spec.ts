import { strict as assert } from 'node:assert';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { test } from 'vitest';
import type { PosService } from './pos.service';
import { TillGuard, type TillRequest, type TillTarget } from './till.guard';

const C1 = '6f1c0e1a-2b3c-4d5e-8f90-1a2b3c4d5e6f';
const B1 = '7a2d1f2b-3c4d-4e5f-9a01-2b3c4d5e6f70';
const headers = { 'x-till-key': 'till_k' };

function run(target: TillTarget | undefined, request: Partial<TillRequest>) {
  const asked: unknown[] = [];
  const pos = {
    requireTill: (key: string | undefined, what: unknown) => {
      asked.push([key, what]);
      return Promise.resolve({ counterIds: [C1] });
    },
  } as unknown as PosService;
  const reflector = { get: () => target } as unknown as Reflector;
  const full: TillRequest = { headers: {}, ...request };
  const context = {
    getHandler: () => undefined,
    switchToHttp: () => ({ getRequest: () => full }),
  } as unknown as ExecutionContext;

  return new TillGuard(reflector, pos)
    .canActivate(context)
    .then((allowed) => ({ allowed, asked, full }));
}

test('a route with no till target is not checked', async () => {
  assert.deepEqual((await run(undefined, {})).asked, []);
});

test('the counter, bill or menu item is read from where the route carries it', async () => {
  const query = { counterId: C1 };
  assert.deepEqual((await run({ from: 'query', kind: 'counterId' }, { headers, query })).asked, [
    ['till_k', { counterId: C1 }],
  ]);
  const params = { id: B1 };
  assert.deepEqual(
    (await run({ from: 'param', kind: 'billId', name: 'id' }, { headers, params })).asked,
    [['till_k', { billId: B1 }]],
  );
  // Missing or not an id: only the till is checked; the route's validation then answers 400.
  for (const body of [{}, { counterId: 'till-1' }]) {
    assert.deepEqual((await run({ from: 'body', kind: 'counterId' }, { body, headers })).asked, [
      ['till_k', {}],
    ]);
  }
  // No counter at all (the employee lookup): only that it is a till.
  const { asked, full } = await run({}, { headers });
  assert.deepEqual(asked, [['till_k', {}]]);
  assert.deepEqual(full.till, { counterIds: [C1] }, 'the till’s counters, for lists');
});

test('a route shared with other screens is checked only when a till calls it', async () => {
  assert.deepEqual((await run({ optional: true }, {})).asked, []);
  assert.deepEqual((await run({ optional: true }, { headers })).asked, [['till_k', {}]]);
});
