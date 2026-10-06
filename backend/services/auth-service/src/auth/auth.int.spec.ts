// Characterisation of sign-in over HTTP: email + password and mobile OTP, each with its failures.
// The SMS gateway is replaced by a spy that records the code, so no message can ever be sent.
//
// Runs only with DATABASE_URL_TEST: a migrated database it may write to. It adds one uniquely
// named user per run and touches nothing else.
import type { AddressInfo } from 'node:net';
import { hashPassword } from '@aahar/auth';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SmsService } from './services/sms.service';

type Body = Record<string, unknown>;

const databaseUrl = process.env.DATABASE_URL_TEST;
const run = Date.now().toString(36);
// Starts with 5, which no Indian mobile number does.
const mobile = `5${String(Date.now()).slice(-9)}`;
const email = `login-${run}@characterisation.test`;
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

const claimsOf = (accessToken: unknown) =>
  JSON.parse(Buffer.from(String(accessToken).split('.')[1] ?? '', 'base64url').toString()) as Body;

describe.skipIf(!databaseUrl)('sign-in (integration)', { timeout: 30_000 }, () => {
  let app: INestApplication | undefined;
  let baseUrl = '';
  let userId = '';
  const sent: { mobile: string; otp: string }[] = [];

  async function post(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const json = (await response.json()) as Body;
    return { body: json, data: (json.data ?? {}) as Body, status: response.status };
  }

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
      REDIS_URL: '',
      // Blank, so the real gateway is unconfigured even if a .env carries its credentials.
      SMS_FEED_ID: '',
      SMS_PASSWORD: '',
      SMS_SENDER_ID: '',
      SMS_USERNAME: '',
      SWAGGER_ENABLED: 'false',
    });
    process.env.JWT_ACCESS_SECRET ||= 'characterisation-access-secret-0123456789';
    process.env.JWT_REFRESH_SECRET ||= 'characterisation-refresh-secret-0123456789';
    vi.spyOn(SmsService.prototype, 'isConfigured').mockReturnValue(true);
    vi.spyOn(SmsService.prototype, 'sendOtp').mockImplementation((to: string, otp: string) => {
      sent.push({ mobile: to, otp });
      return Promise.resolve();
    });

    // Imported here: ConfigModule reads the environment when app.module is first evaluated.
    const { configureSecurityBaseline } = await import('@aahar/auth');
    const { ConfigService } = await import('@nestjs/config');
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService } = await import('../common/prisma/prisma.service.js');

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

    const user = await nest.get(PrismaService).user.create({
      data: {
        email,
        employeeCode: `CHR-${run}`,
        mobile,
        name: 'Characterisation Login',
        passwordHash: await hashPassword(password),
      },
    });
    userId = user.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it('email + password: issues tokens for the right password only', async () => {
    const signedIn = await post('/auth/login-with-password', { email, password });
    expect(signedIn.status).toBe(201);
    expect(shape(signedIn.body)).toMatchSnapshot('tokens');
    expect(claimsOf(signedIn.data.accessToken)).toMatchObject({
      email,
      mobile,
      sub: userId,
      sv: 0,
    });

    // Case-insensitive on the email, case-sensitive on the password.
    const upper = await post('/auth/login-with-password', { email: email.toUpperCase(), password });
    expect(upper.status).toBe(201);
    for (const attempt of [
      { email, password: password.toLowerCase() },
      { email: `nobody-${run}@characterisation.test`, password },
    ]) {
      const refused = await post('/auth/login-with-password', attempt);
      expect([refused.status, refused.body.message]).toEqual([401, 'Invalid email or password']);
    }
    const refused = await post('/auth/login-with-password', { email, password: 'wrong' });
    expect(shape(refused.body)).toMatchSnapshot('error body');
  });

  it('mobile OTP: sends one code, rejects a wrong one, signs in once with the right one', async () => {
    const unknown = await post('/auth/send-otp', { mobile: '5000000000' });
    expect([unknown.status, unknown.body.message]).toEqual([
      404,
      'This mobile number is not registered. Please contact your administrator.',
    ]);
    expect(sent).toEqual([]);

    const sentOtp = await post('/auth/send-otp', { mobile });
    expect(sentOtp.status).toBe(201);
    expect(sentOtp.body).toMatchObject({
      data: { channel: 'mobile' },
      message: 'OTP sent successfully',
      success: true,
    });
    expect(sent).toHaveLength(1);
    const code = sent[0]?.otp ?? '';
    expect(sent[0]?.mobile).toBe(mobile);
    expect(code).toMatch(/^\d{6}$/);

    const resend = await post('/auth/send-otp', { mobile });
    expect([resend.status, resend.body.message]).toEqual([
      429,
      'Please wait 30 seconds before requesting another OTP',
    ]);
    expect(sent).toHaveLength(1);

    const wrongCode = code === '111111' ? '222222' : '111111';
    const wrong = await post('/auth/verify-otp', { mobile, otp: wrongCode });
    expect([wrong.status, wrong.body.message]).toEqual([401, 'Invalid or expired OTP']);

    const verified = await post('/auth/verify-otp', { mobile, otp: code });
    expect(verified.status).toBe(201);
    expect(shape(verified.body)).toMatchSnapshot('tokens');
    expect(claimsOf(verified.data.accessToken)).toMatchObject({ mobile, sub: userId, sv: 0 });

    const reused = await post('/auth/verify-otp', { mobile, otp: code });
    expect([reused.status, reused.body.message]).toEqual([401, 'Invalid or expired OTP']);
  });
});
