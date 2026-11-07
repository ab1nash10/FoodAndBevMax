import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { logger } from '@aahar/logging';
import { ConfigService } from '@nestjs/config';
import { afterEach, test, vi } from 'vitest';
import type { RedisService } from '../../common/redis/redis.service';
import type { MailService } from './mail.service';
import { OtpService } from './otp.service';
import type { SmsService } from './sms.service';

// Nothing here may reach a real gateway: blank credentials, and any network call fails the test.
Object.assign(process.env, {
  MAIL_CLIENT_ID: '',
  MAIL_CLIENT_SECRET: '',
  MAIL_SENDER: '',
  MAIL_TENANT_ID: '',
  SMS_FEED_ID: '',
  SMS_PASSWORD: '',
  SMS_SENDER_ID: '',
  SMS_USERNAME: '',
});
globalThis.fetch = () => {
  throw new Error('No network call is allowed in this test');
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The Redis operations the OTP flow uses, kept in a Map with real expiry. */
function fakeRedis() {
  const entries = new Map<string, { expiresAt: number; value: string }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) entries.delete(key);
    return entries.get(key);
  };
  const redis = {
    delete: (key: string) => Promise.resolve(live(key) ? entries.delete(key) : false),
    get: (key: string) => Promise.resolve(live(key)?.value ?? null),
    increment: (key: string, ttlSeconds: number) => {
      const count = Number(live(key)?.value ?? 0) + 1;
      entries.set(key, {
        expiresAt: live(key)?.expiresAt ?? Date.now() + ttlSeconds * 1000,
        value: String(count),
      });
      return Promise.resolve(count);
    },
    setIfAbsent: (key: string, value: string, ttlSeconds: number) => {
      if (live(key)) return Promise.resolve(false);
      entries.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
      return Promise.resolve(true);
    },
    setWithExpiry: (key: string, value: string, ttlSeconds: number) => {
      entries.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
      return Promise.resolve();
    },
  };

  return { entries, redis };
}

function otpService(
  env: Record<string, unknown> = { NODE_ENV: 'test' },
  configured = { mail: true, sms: true },
) {
  const smsSent: Array<{ mobile: string; otp: string }> = [];
  const mailSent: Array<{ email: string; minutes: number; otp: string }> = [];
  const sms = {
    isConfigured: () => configured.sms,
    sendOtp: vi.fn((mobile: string, otp: string) => {
      smsSent.push({ mobile, otp });
      return Promise.resolve();
    }),
  };
  const mail = {
    isConfigured: () => configured.mail,
    sendOtp: vi.fn((email: string, otp: string, minutes: number) => {
      mailSent.push({ email, minutes, otp });
      return Promise.resolve();
    }),
  };
  const { entries, redis } = fakeRedis();
  const service = new OtpService(
    new ConfigService(env),
    mail as unknown as MailService,
    redis as unknown as RedisService,
    sms as unknown as SmsService,
  );

  return { entries, mail, mailSent, service, sms, smsSent };
}

const invalid = (error: unknown) =>
  error instanceof UnauthorizedException && error.message === 'Invalid or expired OTP';

test('a mobile number gets its code by SMS, an email by mail, and mobile wins when both are sent', async () => {
  const { mailSent, service, smsSent } = otpService({ NODE_ENV: 'test', OTP_TTL_SECONDS: 600 });

  assert.deepEqual(service.getTarget({ email: 'Asha@Max.in', mobile: '9876543210' }), {
    channel: 'mobile',
    value: '9876543210',
  });
  assert.deepEqual(service.getTarget({ email: 'Asha@Max.in' }), {
    channel: 'email',
    value: 'asha@max.in',
  });
  assert.throws(() => service.getTarget({}), BadRequestException);

  await service.send({ channel: 'mobile', value: '9876543210' });
  await service.send({ channel: 'email', value: 'asha@max.in' });

  assert.equal(smsSent.length, 1);
  assert.equal(smsSent[0]?.mobile, '9876543210');
  assert.match(smsSent[0]?.otp ?? '', /^\d{6}$/);
  assert.equal(mailSent.length, 1);
  assert.equal(mailSent[0]?.email, 'asha@max.in');
  assert.match(mailSent[0]?.otp ?? '', /^\d{6}$/);
  assert.equal(mailSent[0]?.minutes, 10, 'the mail states how long the code lasts');
});

test('the right code signs in exactly once; a wrong one does not', async () => {
  const { service, smsSent } = otpService();
  await service.send({ channel: 'mobile', value: '9876543210' });
  const code = smsSent[0]?.otp ?? '';
  const wrong = code === '111111' ? '222222' : '111111';

  await assert.rejects(service.verify({ mobile: '9876543210', otp: wrong }), invalid);
  assert.deepEqual(await service.verify({ mobile: '9876543210', otp: code }), {
    channel: 'mobile',
    value: '9876543210',
  });
  // Consumed: the same code cannot be replayed.
  await assert.rejects(service.verify({ mobile: '9876543210', otp: code }), invalid);
  // A code for one number never signs in another.
  await service.send({ channel: 'mobile', value: '9000000001' });
  await assert.rejects(
    service.verify({ mobile: '9000000002', otp: smsSent[1]?.otp ?? '' }),
    invalid,
  );
});

test('a code expires after OTP_TTL_SECONDS, five minutes by default', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { service, smsSent } = otpService();
  await service.send({ channel: 'mobile', value: '9876543210' });

  vi.advanceTimersByTime(299_000);
  await service.send({ channel: 'mobile', value: '9000000001' });
  vi.advanceTimersByTime(2_000);

  await assert.rejects(
    service.verify({ mobile: '9876543210', otp: smsSent[0]?.otp ?? '' }),
    invalid,
  );
  assert.deepEqual(await service.verify({ mobile: '9000000001', otp: smsSent[1]?.otp ?? '' }), {
    channel: 'mobile',
    value: '9000000001',
  });
});

test('five wrong guesses burn the code, so even the right one is then refused', async () => {
  const { service, smsSent } = otpService();
  await service.send({ channel: 'mobile', value: '9876543210' });
  const code = smsSent[0]?.otp ?? '';
  const wrong = code === '111111' ? '222222' : '111111';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(service.verify({ mobile: '9876543210', otp: wrong }), invalid);
  }
  // Four misses leave the code usable.
  await service.send({ channel: 'mobile', value: '9000000001' });
  const other = smsSent[1]?.otp ?? '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(
      service.verify({ mobile: '9000000001', otp: other === '111111' ? '222222' : '111111' }),
      invalid,
    );
  }
  assert.ok(await service.verify({ mobile: '9000000001', otp: other }));

  await assert.rejects(service.verify({ mobile: '9876543210', otp: wrong }), invalid);
  await assert.rejects(service.verify({ mobile: '9876543210', otp: code }), invalid);
});

test('a new code clears the miss count of the old one', async () => {
  const { service, smsSent } = otpService();
  const target = { channel: 'mobile', value: '9876543210' } as const;
  await service.send(target);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(service.verify({ mobile: target.value, otp: 'abcdef' }), invalid);
  }

  await service.send(target);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(service.verify({ mobile: target.value, otp: 'abcdef' }), invalid);
  }
  assert.ok(await service.verify({ mobile: target.value, otp: smsSent[1]?.otp ?? '' }));
});

test('the dev code 000000 works only in development with ALLOW_DEV_OTP=true', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { service: dev } = otpService({ ALLOW_DEV_OTP: 'true', NODE_ENV: 'development' });
  assert.deepEqual(await dev.verify({ email: 'Asha@max.in', otp: '000000' }), {
    channel: 'email',
    value: 'asha@max.in',
  });

  for (const env of [
    ...['production', 'test', 'staging', undefined].map((NODE_ENV) => ({
      ALLOW_DEV_OTP: 'true',
      NODE_ENV,
    })),
    // Development alone is not enough: the flag must be set too.
    { NODE_ENV: 'development' },
    { ALLOW_DEV_OTP: 'false', NODE_ENV: 'development' },
  ]) {
    const NODE_ENV = JSON.stringify(env);
    const { service } = otpService(env);
    await assert.rejects(
      service.verify({ mobile: '9876543210', otp: '000000' }),
      invalid,
      String(NODE_ENV),
    );
    // Not even when a real code is waiting.
    await service.send({ channel: 'mobile', value: '9876543210' });
    await assert.rejects(
      service.verify({ mobile: '9876543210', otp: '000000' }),
      invalid,
      String(NODE_ENV),
    );
  }
});

test('without a configured channel only development with ALLOW_DEV_OTP may sign in, with the fixed dev code', async () => {
  const unconfigured = { mail: false, sms: false };
  const mobile = { channel: 'mobile', value: '9876543210' } as const;
  const email = { channel: 'email', value: 'asha@max.in' } as const;

  for (const env of [
    { ALLOW_DEV_OTP: 'true', NODE_ENV: 'production' },
    { ALLOW_DEV_OTP: 'true', NODE_ENV: 'test' },
    { NODE_ENV: 'development' },
  ]) {
    const { service } = otpService(env, unconfigured);
    assert.throws(() => service.assertCanDeliver(mobile), ServiceUnavailableException);
    assert.throws(() => service.assertCanDeliver(email), ServiceUnavailableException);
  }
  // Each channel is judged on its own gateway.
  const { service: smsOnly } = otpService({ NODE_ENV: 'production' }, { mail: false, sms: true });
  smsOnly.assertCanDeliver(mobile);
  assert.throws(() => smsOnly.assertCanDeliver(email), ServiceUnavailableException);

  const { mail, service, sms } = otpService(
    { ALLOW_DEV_OTP: 'true', NODE_ENV: 'development' },
    unconfigured,
  );
  service.assertCanDeliver(mobile);
  await service.send(mobile);

  assert.equal(sms.sendOtp.mock.calls.length, 0);
  assert.equal(mail.sendOtp.mock.calls.length, 0);
  assert.ok(await service.verify({ mobile: mobile.value, otp: '000000' }));
});

test('the code is never written to the log, in any environment', async () => {
  for (const NODE_ENV of ['development', 'production']) {
    const lines: unknown[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => void lines.push(args));
    }
    const { service, smsSent } = otpService({ NODE_ENV });

    await service.send({ channel: 'mobile', value: '9876543210' });

    const otp = smsSent[0]?.otp ?? '';
    assert.match(otp, /^\d{6}$/);
    assert.ok(!JSON.stringify(lines).includes(otp), `${NODE_ENV} logged the code`);
    assert.ok(!JSON.stringify(lines).includes('9876543210'), `${NODE_ENV} logged the full number`);
    vi.restoreAllMocks();
  }
});

test('one number may ask for a new code only every 30 seconds', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { service } = otpService();
  const target = { channel: 'mobile', value: '9876543210' } as const;

  await service.claimSendSlot(target);
  await assert.rejects(
    service.claimSendSlot(target),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
  );
  // Another number, or the same number by email, is not held up.
  await service.claimSendSlot({ channel: 'mobile', value: '9000000001' });
  await service.claimSendSlot({ channel: 'email', value: '9876543210' });

  vi.advanceTimersByTime(30_001);
  await service.claimSendSlot(target);
});

test('a failed delivery drops the code and the cooldown, so the user can retry at once', async () => {
  const { entries, service, sms } = otpService();
  const target = { channel: 'mobile', value: '9876543210' } as const;
  sms.sendOtp.mockRejectedValueOnce(new ServiceUnavailableException('gateway down'));

  await service.claimSendSlot(target);
  await assert.rejects(service.send(target), ServiceUnavailableException);

  assert.equal(entries.has('auth:otp:mobile:9876543210'), false);
  await service.claimSendSlot(target);
});

const tooMany = (error: unknown) => error instanceof HttpException && error.getStatus() === 429;

test('a new code does not reset the day: 15 wrong guesses lock the number until the day is over', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { service, smsSent } = otpService();
  const target = { channel: 'mobile', value: '9876543210' } as const;

  // Three codes, five misses each: every code is burnt, and the fifteenth miss locks the number.
  for (let code = 0; code < 3; code += 1) {
    await service.send(target);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(service.verify({ mobile: target.value, otp: 'abcdef' }), invalid);
    }
    vi.advanceTimersByTime(30_001);
  }
  await service.send(target);
  await assert.rejects(
    service.verify({ mobile: target.value, otp: smsSent.at(-1)?.otp ?? '' }),
    (error: unknown) => tooMany(error) && /Too many wrong codes/.test((error as Error).message),
  );
  // Another number is not held up.
  await service.send({ channel: 'mobile', value: '9000000001' });
  assert.ok(await service.verify({ mobile: '9000000001', otp: smsSent.at(-1)?.otp ?? '' }));

  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  await service.send(target);
  assert.ok(await service.verify({ mobile: target.value, otp: smsSent.at(-1)?.otp ?? '' }));
});

test('a right code clears the day count of wrong guesses', async () => {
  const { service, smsSent } = otpService();
  const target = { channel: 'mobile', value: '9876543210' } as const;

  for (let round = 0; round < 4; round += 1) {
    await service.send(target);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await assert.rejects(service.verify({ mobile: target.value, otp: 'abcdef' }), invalid);
    }
    assert.ok(await service.verify({ mobile: target.value, otp: smsSent.at(-1)?.otp ?? '' }));
  }
});

test('one number gets at most 10 codes a day', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { service } = otpService();
  const target = { channel: 'email', value: 'asha@max.in' } as const;

  for (let sent = 0; sent < 10; sent += 1) {
    await service.claimSendSlot(target);
    vi.advanceTimersByTime(30_001);
  }
  await assert.rejects(
    service.claimSendSlot(target),
    (error: unknown) => tooMany(error) && /Too many OTPs requested/.test((error as Error).message),
  );
  await service.claimSendSlot({ channel: 'email', value: 'ravi@max.in' });

  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  await service.claimSendSlot(target);
});
