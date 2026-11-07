import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { getRequestContext, runWithRequestContext, setRequestContext } from './context';
import { createLogger, defaultLogLevel } from './logger';
import { maskPhone, REDACTED, scrubSecrets } from './redact';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });

  return { lines, log: createLogger(stream) };
}

void test('every line is JSON with the base fields', () => {
  const { lines, log } = capture();

  runWithRequestContext({ requestId: 'req-1', route: '/api/v1/grns/:id' }, () => {
    setRequestContext({ hospitalId: 'h-1', userId: 'u-1' });
    log.info('hello');
  });

  const [line] = lines;
  assert.ok(line);
  for (const field of ['time', 'level', 'service', 'env', 'version', 'msg']) {
    assert.ok(field in line, `missing ${field}`);
  }
  assert.equal(line.level, 'info');
  assert.equal(line.requestId, 'req-1');
  assert.equal(line.userId, 'u-1');
  assert.equal(line.hospitalId, 'h-1');
  assert.equal(line.route, '/api/v1/grns/:id');
});

void test('secrets are redacted and phone numbers masked, at the top level and one down', () => {
  const { lines, log } = capture();

  log.info(
    {
      body: { mobile: '9815925566', otp: '123456', password: 'hunter2' },
      headers: { authorization: 'Bearer eyJabc', cookie: 'sid=1', 'x-till-key': 'k' },
      refreshToken: 'r',
      token: 't',
    },
    'login',
  );

  const text = JSON.stringify(lines[0]);
  for (const secret of ['123456', 'hunter2', 'eyJabc', 'sid=1', '9815925566']) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  }
  assert.match(text, /\*+5566/);
  assert.ok(text.includes(REDACTED));
});

void test('maskPhone keeps the last four digits only', () => {
  assert.equal(maskPhone('9815925566'), '******5566');
  assert.equal(maskPhone('+91 98159 25566'), '********5566');
  assert.equal(maskPhone('12'), REDACTED);
  assert.equal(maskPhone(undefined), REDACTED);
});

void test('scrubSecrets removes secrets at any depth and leaves the rest', () => {
  assert.deepEqual(
    scrubSecrets({ a: { b: [{ apiKey: 'x', name: 'n' }] }, PassWord: 'p', qty: 2 }),
    { a: { b: [{ apiKey: REDACTED, name: 'n' }] }, PassWord: REDACTED, qty: 2 },
  );
});

void test('the context follows the request across awaits and stays apart between requests', async () => {
  const seen: (string | undefined)[] = [];
  const handle = (id: string, delay: number) =>
    runWithRequestContext({ requestId: id }, async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      setRequestContext({ userId: `user-${id}` });
      await Promise.resolve();
      seen.push(`${getRequestContext()?.requestId}:${getRequestContext()?.userId}`);
    });

  await Promise.all([handle('a', 20), handle('b', 5)]);

  assert.deepEqual(seen.sort(), ['a:user-a', 'b:user-b']);
  assert.equal(getRequestContext(), undefined);
  setRequestContext({ userId: 'nobody' }); // outside a request: a no-op, not a throw
});

void test('level: LOG_LEVEL wins, else info in production and debug elsewhere', () => {
  assert.equal(defaultLogLevel({ LOG_LEVEL: 'warn', NODE_ENV: 'production' }), 'warn');
  assert.equal(defaultLogLevel({ NODE_ENV: 'production' }), 'info');
  assert.equal(defaultLogLevel({ NODE_ENV: 'development' }), 'debug');
});
