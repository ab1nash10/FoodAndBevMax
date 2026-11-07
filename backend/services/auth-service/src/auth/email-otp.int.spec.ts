// Characterisation of email OTP sign-in over HTTP, plus refresh and logout: the happy path and the
// claims it issues, wrong, reused and expired codes, the attempt limit, the per-email throttles,
// unknown and inactive accounts, and delivery failures. auth.int.spec.ts covers password and SMS.
//
// The Microsoft Graph mail sender is replaced by a spy that records the code, and the SMS sender
// by one that records anything, so no email or text can ever be sent.
//
// Runs only with DATABASE_URL_TEST: a migrated database it may write to. It adds uniquely named
// users (and one role) per run and touches nothing else.
process.env.TZ = 'UTC';

import type { AddressInfo } from 'node:net';
import { hashPassword } from '@aahar/auth';
import { type INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { MailService } from './services/mail.service';
import { SmsService } from './services/sms.service';

type Body = Record<string, unknown>;

const databaseUrl = process.env.DATABASE_URL_TEST;
const run = Date.now().toString(36);
// Ten digits starting 56: no Indian mobile starts with 5, and the stamp keeps runs apart.
const mobileStamp = String(Date.now()).slice(-6);
let sequence = 10;
const password = `Characterisation-${run}`;

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value === null) return null;
  if (typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, shape((value as Body)[key])]),
  );
}

/**
 * No request may leave this machine: the .env carries live Microsoft Graph and SMS credentials,
 * and both senders use the global fetch. Copied from organization-service's int-harness.ts.
 * Returns the real fetch, to put back afterwards.
 */
function blockOutboundFetch(): typeof fetch {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return Promise.reject(new Error(`integration tests may not call ${url.origin}`));
    }
    return realFetch(input, init);
  };
  return realFetch;
}

const claimsOf = (token: unknown) =>
  JSON.parse(Buffer.from(String(token).split('.')[1] ?? '', 'base64url').toString()) as Body;
const wrongCode = (code: string) => (code === '111111' ? '222222' : '111111');

const tokensShape = {
  data: { accessToken: 'string', refreshToken: 'string' },
  message: 'string',
  success: 'boolean',
};
const NOT_REGISTERED =
  'This email is not registered. Please contact your IT team for access rights.';
const INVALID_OTP = 'Invalid or expired OTP';

describe.skipIf(!databaseUrl)(
  'email OTP sign-in, refresh and logout (integration)',
  { timeout: 30_000 },
  () => {
    let app: INestApplication | undefined;
    let prisma: PrismaService;
    let baseUrl = '';
    let roleName = '';
    let roleId = '';
    const mailed: { email: string; minutes: number; otp: string }[] = [];
    const texted: string[] = [];

    async function post(path: string, body: unknown) {
      const response = await fetch(`${baseUrl}${path}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const json = (await response.json()) as Body;
      return { body: json, data: (json.data ?? {}) as Body, status: response.status };
    }
    const refused = (call: { body: Body; status: number }) => [call.status, call.body.message];

    /** A portal-style user straight in the database, holding the suite's role. */
    async function portalUser(label: string, status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
      const n = sequence++;
      return prisma.user.create({
        data: {
          email: `${label}-${n}-${run}@characterisation.test`,
          employeeCode: `CHR-OTP-${run}-${n}`.toUpperCase(),
          mobile: `56${mobileStamp}${n}`,
          name: `Characterisation ${label} ${n}`,
          passwordHash: await hashPassword(password),
          roles: { create: [{ roleId }] },
          status,
        },
      });
    }

    /** Sends a code to the email and returns what the mail spy captured. */
    async function sendCode(email: string) {
      const before = mailed.length;
      const sent = await post('/auth/send-otp', { email });
      expect(sent.status).toBe(201);
      expect(mailed).toHaveLength(before + 1);
      return mailed.at(-1) ?? { email: '', minutes: 0, otp: '' };
    }

    let realFetch: typeof fetch | undefined;
    let mailIsConfigured: MockInstance<MailService['isConfigured']> | undefined;
    let mailSendOtp: MockInstance<MailService['sendOtp']> | undefined;

    beforeAll(async () => {
      realFetch = blockOutboundFetch();
      // A single space, not '': ConfigModule expands the .env files with dotenv-expand, which
      // treats an empty variable as unset and writes the file's value over it. A space survives,
      // and the senders trim it to nothing, so the real gateways stay unconfigured.
      Object.assign(process.env, {
        DATABASE_URL: databaseUrl,
        MAIL_CLIENT_ID: ' ',
        MAIL_CLIENT_SECRET: ' ',
        MAIL_SENDER: ' ',
        MAIL_TENANT_ID: ' ',
        NODE_ENV: 'test',
        REDIS_URL: '',
        SMS_FEED_ID: ' ',
        SMS_PASSWORD: ' ',
        SMS_SENDER_ID: ' ',
        SMS_USERNAME: ' ',
        SWAGGER_ENABLED: 'false',
      });
      process.env.JWT_ACCESS_SECRET ||= 'characterisation-access-secret-0123456789';
      process.env.JWT_REFRESH_SECRET ||= 'characterisation-refresh-secret-0123456789';
      // The mail channel reports itself configured, and "sending" only records the code.
      mailIsConfigured = vi.spyOn(MailService.prototype, 'isConfigured').mockReturnValue(true);
      mailSendOtp = vi
        .spyOn(MailService.prototype, 'sendOtp')
        .mockImplementation((email: string, otp: string, minutes: number) => {
          mailed.push({ email, minutes, otp });
          return Promise.resolve();
        });
      vi.spyOn(SmsService.prototype, 'sendOtp').mockImplementation((to: string) => {
        texted.push(to);
        return Promise.resolve();
      });

      // Imported here: ConfigModule reads the environment when app.module is first evaluated.
      const { configureSecurityBaseline, getSharedRedis } = await import('@aahar/auth');
      // REDIS_URL cannot be a space (the env schema refuses it) and the .env value would replace
      // '': settle the shared client as "none" now, while REDIS_URL is still empty. Codes,
      // refresh tokens and throttle counters then live in this process, never in a real Redis.
      expect(getSharedRedis()).toBeNull();
      const { ConfigService } = await import('@nestjs/config');
      const { NestFactory } = await import('@nestjs/core');
      const { AppModule } = await import('../app.module.js');
      const { PrismaService: Prisma } = await import('../common/prisma/prisma.service.js');

      const nest = await NestFactory.create(AppModule, { logger: false });
      app = nest;
      configureSecurityBaseline(nest, nest.get(ConfigService), {
        serviceName: 'auth-service',
        swaggerDescription: '',
        swaggerTitle: '',
      });
      await nest.listen(0, '127.0.0.1');
      const { port } = (nest.getHttpServer() as { address(): AddressInfo }).address();
      baseUrl = `http://127.0.0.1:${port}/api/v1`;
      prisma = nest.get(Prisma);
      // Prove the guards above held: no real Redis, no SMS or mail gateway credentials.
      const { RedisService } = await import('../common/redis/redis.service.js');
      const redis: unknown = nest.get(RedisService);
      expect((redis as { client: unknown }).client).toBeNull();
      expect(nest.get(SmsService).isConfigured()).toBe(false);
      const config = nest.get(ConfigService);
      expect(
        ['MAIL_CLIENT_SECRET', 'MAIL_TENANT_ID'].map((key) => config.get<string>(key)?.trim()),
      ).toEqual(['', '']);

      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: 'PERMISSION_VIEW' },
      });
      roleName = `Characterisation OTP ${run}`;
      roleId = (
        await prisma.role.create({
          data: { name: roleName, permissions: { create: [{ permissionId: permission.id }] } },
        })
      ).id;
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      vi.restoreAllMocks();
      if (realFetch) globalThis.fetch = realFetch;
    });

    it('sends one code by email, signs in once with it, and issues the user’s claims', async () => {
      const user = await portalUser('otp');
      const email = user.email ?? '';

      // The address is matched case-insensitively and mailed in lower case.
      const sent = await post('/auth/send-otp', { email: email.toUpperCase() });
      expect(sent.status).toBe(201);
      expect(sent.body).toEqual({
        data: { channel: 'email' },
        message: 'OTP sent successfully',
        success: true,
      });
      expect(mailed).toHaveLength(1);
      const code = mailed[0]?.otp ?? '';
      expect(mailed[0]).toMatchObject({ email, minutes: expect.any(Number) as number });
      expect(code).toMatch(/^\d{6}$/);

      const resend = await post('/auth/send-otp', { email });
      expect(refused(resend)).toEqual([
        429,
        'Please wait 30 seconds before requesting another OTP',
      ]);
      expect(mailed).toHaveLength(1);

      expect(refused(await post('/auth/verify-otp', { email, otp: wrongCode(code) }))).toEqual([
        401,
        INVALID_OTP,
      ]);
      // One miss does not burn the code.
      const verified = await post('/auth/verify-otp', { email: email.toUpperCase(), otp: code });
      expect(verified.status).toBe(201);
      expect(shape(verified.body)).toEqual(tokensShape);
      expect(verified.body.message).toBe('Success');
      const claims = claimsOf(verified.data.accessToken);
      expect(claims).toEqual({
        email,
        exp: expect.any(Number) as number,
        iat: expect.any(Number) as number,
        mobile: user.mobile,
        name: user.name,
        permissions: ['PERMISSION_VIEW'],
        roles: [roleName],
        sub: user.id,
        sv: 1,
      });
      expect(claimsOf(verified.data.refreshToken)).toMatchObject({
        jti: expect.any(String) as string,
        sub: user.id,
        sv: 1,
        type: 'refresh',
      });

      const reused = await post('/auth/verify-otp', { email, otp: code });
      expect(refused(reused)).toEqual([401, INVALID_OTP]);

      // Saved in the background, after the response.
      await vi.waitFor(async () => {
        const audit = await prisma.auditLog.findMany({
          where: { action: 'LOGIN_SUCCESS', entityId: user.id },
        });
        expect(audit.map(({ newValue, userId }) => ({ newValue, userId }))).toEqual([
          { newValue: { channel: 'email' }, userId: user.id },
        ]);
      });
      expect(texted).toEqual([]);
    });

    it('five wrong codes burn the code, so the right one no longer works', async () => {
      const email = (await portalUser('burn')).email ?? '';
      const { otp } = await sendCode(email);

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const wrong = await post('/auth/verify-otp', { email, otp: wrongCode(otp) });
        expect([attempt, ...refused(wrong)]).toEqual([attempt, 401, INVALID_OTP]);
      }
      expect(refused(await post('/auth/verify-otp', { email, otp }))).toEqual([401, INVALID_OTP]);
    });

    it('an expired code is refused; a new one can be sent once the cooldown has passed', async () => {
      const email = (await portalUser('expiry')).email ?? '';
      const { minutes, otp } = await sendCode(email);

      // Codes live in this process (no REDIS_URL), timed by Date.now: step past the expiry.
      const realNow = Date.now.bind(Date);
      const ahead = vi
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow() + (minutes * 60 + 61) * 1000);
      try {
        expect(refused(await post('/auth/verify-otp', { email, otp }))).toEqual([401, INVALID_OTP]);
        const fresh = await sendCode(email);
        expect(fresh.otp).toMatch(/^\d{6}$/);
        const signedIn = await post('/auth/verify-otp', { email, otp: fresh.otp });
        expect(signedIn.status).toBe(201);
      } finally {
        ahead.mockRestore();
      }
    });

    it('per-email throttles: the sixth send and the eleventh verify in a minute are refused', async () => {
      const email = (await portalUser('throttle')).email ?? '';
      await sendCode(email);
      for (let attempt = 2; attempt <= 5; attempt += 1) {
        const cooling = await post('/auth/send-otp', { email });
        expect([attempt, ...refused(cooling)]).toEqual([
          attempt,
          429,
          'Please wait 30 seconds before requesting another OTP',
        ]);
      }
      const sixth = await post('/auth/send-otp', { email });
      expect(refused(sixth)).toEqual([429, 'ThrottlerException: Too Many Requests']);

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const guess = await post('/auth/verify-otp', { email, otp: '000000' });
        expect([attempt, guess.status]).toEqual([attempt, 401]);
      }
      expect(refused(await post('/auth/verify-otp', { email, otp: '000000' }))).toEqual([
        429,
        'ThrottlerException: Too Many Requests',
      ]);
      // The limit is per email, not per address: another account is unaffected.
      const other = (await portalUser('throttle-other')).email ?? '';
      expect(refused(await post('/auth/verify-otp', { email: other, otp: '000000' }))).toEqual([
        401,
        INVALID_OTP,
      ]);
      expect(mailed.filter((row) => row.email === email)).toHaveLength(1);
    });

    it('an unknown, disabled or deleted account gets no code', async () => {
      const before = mailed.length;
      // By design the 404 tells an unregistered person to ask their IT team for access (the
      // throttles bound anyone probing which emails exist).
      const unknown = await post('/auth/send-otp', {
        email: `nobody-${run}@characterisation.test`,
      });
      expect(refused(unknown)).toEqual([404, NOT_REGISTERED]);

      const disabled = await portalUser('disabled', 'DISABLED');
      expect(refused(await post('/auth/send-otp', { email: disabled.email }))).toEqual([
        404,
        NOT_REGISTERED,
      ]);
      const deleted = await portalUser('deleted');
      await prisma.user.update({ data: { deletedAt: new Date() }, where: { id: deleted.id } });
      expect(refused(await post('/auth/send-otp', { email: deleted.email }))).toEqual([
        404,
        NOT_REGISTERED,
      ]);
      expect(mailed).toHaveLength(before);

      // Verifying for an account with no code says nothing about whether it exists.
      for (const email of [`nobody-${run}@characterisation.test`, disabled.email]) {
        expect(refused(await post('/auth/verify-otp', { email, otp: '123456' }))).toEqual([
          401,
          INVALID_OTP,
        ]);
      }

      // Disabled after the code went out: the code is spent, but no session is issued.
      const late = await portalUser('late');
      const { otp } = await sendCode(late.email ?? '');
      await prisma.user.update({ data: { status: 'DISABLED' }, where: { id: late.id } });
      expect(refused(await post('/auth/verify-otp', { email: late.email, otp }))).toEqual([
        401,
        'User is not registered or active',
      ]);
    });

    it('validates the body, and reports a channel that cannot deliver', async () => {
      const email = (await portalUser('checks')).email ?? '';
      expect(refused(await post('/auth/send-otp', {}))).toEqual([
        400,
        'Mobile number or email is required',
      ]);
      expect(refused(await post('/auth/send-otp', { email: 'nope' }))).toEqual([
        400,
        'email must be an email',
      ]);
      expect(refused(await post('/auth/send-otp', { email, extra: 1 }))).toEqual([
        400,
        'property extra should not exist',
      ]);
      expect(refused(await post('/auth/verify-otp', { email, otp: '12345' }))).toEqual([
        400,
        'otp must match /^\\d{6}$/ regular expression',
      ]);
      expect(refused(await post('/auth/verify-otp', { otp: '123456' }))).toEqual([
        400,
        'Mobile number or email is required',
      ]);
      // With both, the mobile wins: SMS is unconfigured here, so it is refused before any lookup.
      expect(refused(await post('/auth/send-otp', { email, mobile: '5999999999' }))).toEqual([
        503,
        'OTP sign-in is not available right now',
      ]);

      // Mail not configured: refused, nothing sent, no cooldown taken.
      const before = mailed.length;
      mailIsConfigured?.mockReturnValueOnce(false);
      expect(refused(await post('/auth/send-otp', { email }))).toEqual([
        503,
        'OTP sign-in is not available right now',
      ]);
      // Graph fails: the code and the cooldown are dropped, so the user can retry at once.
      mailSendOtp?.mockImplementationOnce(() =>
        Promise.reject(
          new ServiceUnavailableException('Could not send the OTP. Please try again.'),
        ),
      );
      expect(refused(await post('/auth/send-otp', { email }))).toEqual([
        503,
        'Could not send the OTP. Please try again.',
      ]);
      expect(mailed).toHaveLength(before);
      const { otp } = await sendCode(email);
      expect((await post('/auth/verify-otp', { email, otp })).status).toBe(201);
      expect(texted).toEqual([]);
    });

    it('refresh rotates the tokens; a new sign-in or logout ends the session', async () => {
      const user = await portalUser('session');
      const email = user.email ?? '';
      const { otp } = await sendCode(email);
      const first = (await post('/auth/verify-otp', { email, otp })).data;
      // Signing in on another browser ends the first session (one browser at a time).
      const second = (await post('/auth/login-with-password', { email, password })).data;
      expect(refused(await post('/auth/refresh', { refreshToken: first.refreshToken }))).toEqual([
        401,
        'Your account was updated. Please sign in again.',
      ]);

      const refreshed = await post('/auth/refresh', { refreshToken: second.refreshToken });
      expect(refreshed.status).toBe(201);
      expect(shape(refreshed.body)).toEqual(tokensShape);
      expect(claimsOf(refreshed.data.accessToken)).toMatchObject({
        email,
        roles: [roleName],
        sub: user.id,
        sv: 2,
      });
      expect(refreshed.data.refreshToken).not.toBe(second.refreshToken);
      // The old refresh token was spent.
      expect(refused(await post('/auth/refresh', { refreshToken: second.refreshToken }))).toEqual([
        401,
        'Invalid refresh token',
      ]);
      // An access token is not a refresh token.
      expect(refused(await post('/auth/refresh', { refreshToken: second.accessToken }))).toEqual([
        401,
        'Invalid refresh token',
      ]);
      expect(refused(await post('/auth/refresh', { refreshToken: 'nope' }))).toEqual([
        400,
        'refreshToken must be a jwt string',
      ]);
      expect(refused(await post('/auth/logout', {}))).toEqual([
        400,
        'refreshToken must be a jwt string',
      ]);

      await prisma.user.update({ data: { lastActiveAt: new Date() }, where: { id: user.id } });
      const loggedOut = await post('/auth/logout', { refreshToken: refreshed.data.refreshToken });
      expect([loggedOut.status, loggedOut.body]).toEqual([
        201,
        { data: { loggedOut: true }, message: 'Success', success: true },
      ]);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      // Signed out: a new session version, and the credential lock is lifted at once.
      expect([row.sessionVersion, row.lastActiveAt]).toEqual([3, null]);

      expect(
        refused(await post('/auth/refresh', { refreshToken: refreshed.data.refreshToken })),
      ).toEqual([401, 'Invalid refresh token']);
      expect(
        refused(await post('/auth/logout', { refreshToken: refreshed.data.refreshToken })),
      ).toEqual([401, 'Invalid refresh token']);

      // A disabled user cannot renew a session.
      const third = (await post('/auth/login-with-password', { email, password })).data;
      expect(claimsOf(third.accessToken).sv).toBe(4);
      await prisma.user.update({ data: { status: 'DISABLED' }, where: { id: user.id } });
      expect(refused(await post('/auth/refresh', { refreshToken: third.refreshToken }))).toEqual([
        401,
        'User is not registered or active',
      ]);
      // Security rows are saved in the background, after the response.
      await vi.waitFor(async () => {
        const actions = await prisma.auditLog.findMany({
          orderBy: { createdAt: 'asc' },
          select: { action: true },
          where: { entityId: user.id, entityName: 'auth_sessions' },
        });
        expect(actions.map(({ action }) => action)).toEqual([
          'LOGIN_SUCCESS',
          'LOGIN_SUCCESS',
          // The first browser's refresh, refused after the second sign-in.
          'SESSION_REVOKED',
          'SESSION_REFRESHED',
          'LOGOUT',
          'LOGIN_SUCCESS',
        ]);
      });
    });
  },
);
