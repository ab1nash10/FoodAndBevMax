// Shared set-up for the *.int.spec.ts suites: boots the whole service on a random port against
// DATABASE_URL_TEST (migrated and seeded), signed in as the seeded Super Admin. Each suite names
// its own records with `run`, so suites never touch existing data and need no cleanup.
// Kept out of the build (tsconfig.build.json excludes src/testing).
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { superAdminForRun } from './super-admin-for-run.js';

export type Body = Record<string, unknown>;

export const databaseUrl = process.env.DATABASE_URL_TEST;
// Two random characters on the clock: suites start in parallel and can share a millisecond.
export const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
export const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Keys and value types only, so a shape change shows up without pinning ids and dates. */
export function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value === null) return null;
  if (typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, shape((value as Body)[key])]),
  );
}

export function firstOf(list: Body[]): Body {
  const [value] = list;
  if (!value) throw new Error('expected at least one row');
  return value;
}

function signAccessToken(secret: string, user: { id: string; sessionVersion: number }): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { exp: now + 3600, iat: now, sub: user.id, sv: user.sessionVersion };
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

export interface Harness {
  app: INestApplication;
  baseUrl: string;
  /** Calls the API as `as` (a signed token; the Super Admin's by default, '' for none). */
  api(
    method: string,
    path: string,
    body?: unknown,
    as?: string,
  ): Promise<{ body: Body; data: Body; status: number }>;
  /** Like api, but throws on a non-2xx and returns `data`. */
  ok(method: string, path: string, body?: unknown, as?: string): Promise<Body>;
  rawQuery<T>(sql: string, ...values: unknown[]): Promise<T[]>;
  signFor(user: { id: string; sessionVersion: number }): string;
  superAdmin: { id: string; sessionVersion: number };
  token: string;
}

/**
 * Refuses every request that isn't to this machine, so no SMS, email or payment gateway is ever
 * reached. Blanking their keys is not enough: ConfigModule's expandVariables fills an empty
 * process.env value back in from .env. Installed on import, so a suite's fake gateway (a spy on
 * fetch) always sits on top of it.
 */
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    return Promise.reject(new Error(`integration tests may not call ${url.origin}`));
  }
  return realFetch(input, init);
};

export async function startHarness(): Promise<Harness> {
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    REDIS_URL: '',
    SWAGGER_ENABLED: 'false',
    THROTTLE_LIMIT: '100000',
  });
  process.env.JWT_ACCESS_SECRET ||= 'characterisation-access-secret-0123456789';
  process.env.JWT_REFRESH_SECRET ||= 'characterisation-refresh-secret-0123456789';

  // Imported here: ConfigModule reads the environment when app.module is first evaluated.
  const { configureSecurityBaseline, getSharedRedis } = await import('@aahar/auth');
  // Caches "no Redis" while REDIS_URL is still blank: ConfigModule refills it from .env, and the
  // suite would then share the dev Redis.
  getSharedRedis();
  const { ConfigService } = await import('@nestjs/config');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { PrismaService } = await import('../common/prisma/prisma.service.js');

  const app = await NestFactory.create(AppModule, { logger: false });
  const config = app.get(ConfigService);
  configureSecurityBaseline(app, config, {
    serviceName: 'organization-service',
    swaggerDescription: '',
    swaggerTitle: '',
  });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as { address(): AddressInfo }).address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const prisma = app.get(PrismaService);

  const superAdmin = await superAdminForRun(prisma, 'h');
  const signFor = (user: { id: string; sessionVersion: number }) =>
    signAccessToken(config.getOrThrow<string>('JWT_ACCESS_SECRET'), user);
  const token = signFor(superAdmin);

  const api: Harness['api'] = async (method, path, body, as = token) => {
    const response = await fetch(`${baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(as ? { authorization: `Bearer ${as}` } : {}),
        'content-type': 'application/json',
      },
      method,
    });
    const text = await response.text();
    const json = (text ? JSON.parse(text) : {}) as Body;
    return { body: json, data: (json.data ?? {}) as Body, status: response.status };
  };

  return {
    api,
    app,
    baseUrl,
    async ok(method, path, body, as) {
      const result = await api(method, path, body, as);
      if (result.status >= 300) {
        throw new Error(`${method} ${path} -> ${result.status} ${JSON.stringify(result.body)}`);
      }
      return result.data;
    },
    rawQuery: <T>(sql: string, ...values: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...values),
    signFor,
    superAdmin,
    token,
  };
}
