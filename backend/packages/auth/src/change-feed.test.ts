import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  CHANGES_CHANNEL,
  ChangeRelay,
  PublishChangesInterceptor,
  changedArea,
} from './change-feed';

void test('a write is named by the first segment of its path after /api/v1', () => {
  assert.equal(changedArea('/fandb/api/v1/hospitals/42'), 'hospitals');
  assert.equal(changedArea('/api/v1/pos/online-payments/7?x=1'), 'pos');
  assert.equal(changedArea('/api/v1/restaurant-menus'), 'restaurant-menus');
  assert.equal(changedArea('/health'), null);
});

function interceptorWith(sent: unknown[][]) {
  const prisma = {
    $executeRawUnsafe: (...args: unknown[]) => {
      sent.push(args);
      return Promise.resolve(1);
    },
  };
  return new PublishChangesInterceptor(prisma);
}

const call = (method: string, path: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ method, path }) }) }) as never;

void test('successful writes are announced once per burst; reads and failures are not', async () => {
  const sent: unknown[][] = [];
  const interceptor = interceptorWith(sent);

  await lastValueFrom(
    interceptor.intercept(call('POST', '/api/v1/items'), { handle: () => of(1) }),
  );
  await lastValueFrom(
    interceptor.intercept(call('PATCH', '/api/v1/hospitals/1'), { handle: () => of(1) }),
  );
  await lastValueFrom(
    interceptor.intercept(call('PUT', '/api/v1/items/2'), { handle: () => of(1) }),
  );
  await lastValueFrom(interceptor.intercept(call('GET', '/api/v1/roles'), { handle: () => of(1) }));
  await assert.rejects(
    lastValueFrom(
      interceptor.intercept(call('DELETE', '/api/v1/stores/1'), {
        handle: () => throwError(() => new Error('refused')),
      }),
    ),
  );

  assert.equal(sent.length, 0, 'held briefly so a burst goes out as one notice');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(sent, [['SELECT pg_notify($1, $2)', CHANGES_CHANNEL, '["items","hospitals"]']]);
});

class FakeResponse extends EventEmitter {
  body = '';
  headers: Record<string, string> = {};
  statusCode = 200;
  ended = false;
  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.body += chunk;
    return true;
  }
  end(chunk = '') {
    this.body += chunk;
    this.ended = true;
  }
}

const viewer = (ip: string) => Object.assign(new EventEmitter(), { ip }) as never;

void test('open screens receive each notice as a server-sent event, and close cleanly', () => {
  const relay = new ChangeRelay({ maxPerAddress: 2 });
  const a = new FakeResponse();
  const b = new FakeResponse();
  const request = viewer('10.0.0.1');
  relay.attach(request, a as never);
  relay.attach(viewer('10.0.0.1'), b as never);

  assert.equal(a.headers['content-type'], 'text/event-stream');
  assert.match(a.headers['cache-control'] ?? '', /no-transform/, 'no proxy may buffer it');

  relay.deliver('["items"]');
  assert.match(a.body, /data: \["items"\]\n\n$/);
  assert.match(b.body, /data: \["items"\]\n\n$/);

  // A third screen from the same address is refused: one address cannot hold the server open.
  const c = new FakeResponse();
  relay.attach(viewer('10.0.0.1'), c as never);
  assert.equal(c.statusCode, 429);
  assert.ok(c.ended);

  (request as unknown as EventEmitter).emit('close');
  relay.deliver('["hospitals"]');
  assert.doesNotMatch(a.body, /hospitals/, 'a closed screen is dropped');
  assert.match(b.body, /hospitals/);
  relay.onModuleDestroy();
});
