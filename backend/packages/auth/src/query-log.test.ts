import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { countPrismaQueries, isSlowQueryLogEnabled, prismaQueryLogOptions } from './query-log';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  mock.restoreAll();
});

function useEnv(env: {
  NODE_ENV?: string;
  PRISMA_QUERY_LOG?: string;
  PRISMA_SLOW_QUERY_LOG?: string;
}) {
  delete process.env.PRISMA_QUERY_LOG;
  delete process.env.PRISMA_SLOW_QUERY_LOG;
  Object.assign(process.env, env);
}

/** A stand-in PrismaClient that records the query listener countPrismaQueries registers. */
function fakeClient() {
  const listeners: ((event: { duration: number; params: string; query: string }) => void)[] = [];

  return {
    client: {
      $on: (_event: 'query', listener: (typeof listeners)[number]) => listeners.push(listener),
    },
    listeners,
  };
}

void test('slow-query warnings are on outside production, and opt-in in a production-mode deploy', () => {
  useEnv({ NODE_ENV: 'development' });
  assert.equal(isSlowQueryLogEnabled(), true);

  useEnv({ NODE_ENV: 'production' });
  assert.equal(isSlowQueryLogEnabled(), false);
  assert.deepEqual(prismaQueryLogOptions(), {});

  useEnv({ NODE_ENV: 'production', PRISMA_SLOW_QUERY_LOG: '1' });
  assert.equal(isSlowQueryLogEnabled(), true);
  assert.deepEqual(prismaQueryLogOptions(), { log: [{ emit: 'event', level: 'query' }] });
});

void test('production without the flag registers no query listener', () => {
  useEnv({ NODE_ENV: 'production' });
  const { client, listeners } = fakeClient();

  countPrismaQueries(client);

  assert.equal(listeners.length, 0);
});

void test('a query over 300 ms logs its SQL and duration, never its parameters', () => {
  useEnv({ NODE_ENV: 'development' });
  const warn = mock.method(console, 'warn', () => {});
  const { client, listeners } = fakeClient();

  countPrismaQueries(client);
  const [onQuery] = listeners;
  assert.ok(onQuery);
  onQuery({ duration: 300, params: '["9000000001"]', query: 'SELECT 1' });
  assert.equal(warn.mock.callCount(), 0);

  onQuery({
    duration: 412.6,
    params: '["9000000001"]',
    query: 'SELECT "users"."id" FROM "users" WHERE "mobile" = $1',
  });
  assert.equal(warn.mock.callCount(), 1);
  const line = String(warn.mock.calls[0]?.arguments[0]);
  assert.deepEqual(JSON.parse(line), {
    durationMs: 413,
    event: 'slow_query',
    query: 'SELECT "users"."id" FROM "users" WHERE "mobile" = $1',
  });
  assert.ok(!line.includes('9000000001'));
});
