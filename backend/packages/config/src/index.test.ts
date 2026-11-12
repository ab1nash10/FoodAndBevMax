import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateServiceEnv } from './index';

const valid = {
  DATABASE_URL: 'postgresql://aahar:secret@localhost:5432/aahar',
  JWT_ACCESS_SECRET: 'a-real-access-secret-0123456789-abcdefghij',
  JWT_REFRESH_SECRET: 'a-real-refresh-secret-0123456789-abcdefghij',
  NODE_ENV: 'production',
  PORT: 4001,
};

const refused = (pattern: RegExp) => (error: unknown) =>
  error instanceof Error && pattern.test(error.message);

void test('the placeholder JWT secrets from the example files are refused', () => {
  for (const placeholder of [
    'replace-with-a-strong-access-secret-before-deploying',
    'REPLACE_ME_minimum_32_characters_long_value',
    'change-me-change-me-change-me-change-me',
  ]) {
    assert.throws(
      () => validateServiceEnv({ ...valid, JWT_ACCESS_SECRET: placeholder }),
      refused(/JWT_ACCESS_SECRET/),
      placeholder,
    );
    assert.throws(
      () => validateServiceEnv({ ...valid, JWT_REFRESH_SECRET: placeholder }),
      refused(/JWT_REFRESH_SECRET/),
      placeholder,
    );
  }
});

void test('the access and refresh secrets must differ', () => {
  assert.throws(
    () => validateServiceEnv({ ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET }),
    refused(/JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET/),
  );
  assert.ok(validateServiceEnv(valid));
});

void test('unset CORS_ORIGINS allows the local origins outside production and none in it', () => {
  assert.equal(validateServiceEnv(valid).CORS_ORIGINS, '');
  assert.equal(validateServiceEnv({ ...valid, NODE_ENV: undefined }).CORS_ORIGINS, '');
  for (const NODE_ENV of ['development', 'test']) {
    assert.match(
      validateServiceEnv({ ...valid, NODE_ENV }).CORS_ORIGINS,
      /http:\/\/localhost:3000/,
    );
  }
  assert.equal(
    validateServiceEnv({ ...valid, CORS_ORIGINS: 'https://fandb.example.in' }).CORS_ORIGINS,
    'https://fandb.example.in',
  );
});

void test('ALLOW_DEV_OTP is only "true" or "false"', () => {
  assert.equal(validateServiceEnv({ ...valid, ALLOW_DEV_OTP: 'true' }).ALLOW_DEV_OTP, 'true');
  assert.equal(validateServiceEnv(valid).ALLOW_DEV_OTP, undefined);
  assert.throws(
    () => validateServiceEnv({ ...valid, ALLOW_DEV_OTP: 'yes' }),
    refused(/ALLOW_DEV_OTP/),
  );
});

void test('THROTTLE_ADDRESS_LIMIT is a whole number of sign-in requests a minute, 6,000 when unset', () => {
  assert.equal(validateServiceEnv(valid).THROTTLE_ADDRESS_LIMIT, 6_000);
  assert.equal(
    validateServiceEnv({ ...valid, THROTTLE_ADDRESS_LIMIT: '20000' }).THROTTLE_ADDRESS_LIMIT,
    20_000,
  );
  assert.throws(
    () => validateServiceEnv({ ...valid, THROTTLE_ADDRESS_LIMIT: '0' }),
    refused(/THROTTLE_ADDRESS_LIMIT/),
  );
});
