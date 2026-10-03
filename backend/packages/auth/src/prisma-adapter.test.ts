import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { test } from 'node:test';
import { prismaPgSettings, uniqueViolationTarget } from './prisma-adapter';

void test('carries the Prisma 6 URL options over and strips them from the pg URL', () => {
  const settings = prismaPgSettings(
    'postgresql://u:p%40ss@db.example.com:5432/aahar?schema=public&connection_limit=10&connect_timeout=8&application_name=fandb',
  );

  assert.equal(
    settings.pool.connectionString,
    'postgresql://u:p%40ss@db.example.com:5432/aahar?application_name=fandb',
  );
  assert.equal(settings.pool.max, 10);
  assert.equal(settings.pool.connectionTimeoutMillis, 8000);
  assert.equal(settings.schema, 'public');
  assert.equal(settings.sslmode, 'prefer');
  assert.deepEqual(settings.pool.ssl, { rejectUnauthorized: false });
});

void test('defaults match Prisma 6 when the URL has no options', () => {
  const settings = prismaPgSettings('postgresql://u:p@localhost:5433/aahar');

  assert.equal(settings.pool.max, availableParallelism() * 2 + 1);
  assert.equal(settings.pool.connectionTimeoutMillis, 5000);
  assert.equal(settings.schema, undefined);
  assert.equal(settings.sslmode, 'prefer');
});

void test('sslmode and sslaccept map to node-postgres ssl options', () => {
  assert.equal(prismaPgSettings('postgresql://h/db?sslmode=disable').pool.ssl, false);
  assert.equal(prismaPgSettings('postgresql://h/db?sslmode=disable').sslmode, 'disable');
  assert.equal(prismaPgSettings('postgresql://h/db?sslmode=require').sslmode, 'require');
  assert.deepEqual(
    prismaPgSettings('postgresql://h/db?sslmode=require&sslaccept=strict').pool.ssl,
    {
      rejectUnauthorized: true,
    },
  );
  assert.equal(
    prismaPgSettings('postgresql://h/db?connect_timeout=0').pool.connectionTimeoutMillis,
    0,
  );
});

void test('uniqueViolationTarget reads both the Prisma 6 and the driver adapter shapes', () => {
  assert.equal(uniqueViolationTarget({ target: ['mobile'] }), 'mobile');
  assert.equal(uniqueViolationTarget({ target: 'users_email_key' }), 'users_email_key');
  assert.equal(
    uniqueViolationTarget({
      driverAdapterError: {
        cause: { constraint: { index: 'users_mobile_key' }, kind: 'UniqueConstraintViolation' },
      },
      modelName: 'User',
    }),
    'users_mobile_key',
  );
  assert.equal(
    uniqueViolationTarget({
      driverAdapterError: { cause: { constraint: { fields: ['item_code'] } } },
    }),
    'item_code',
  );
  assert.equal(uniqueViolationTarget(undefined), '');
});
