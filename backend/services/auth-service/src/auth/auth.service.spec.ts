import { strict as assert } from 'node:assert';
import { HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword, verifyPassword } from '@aahar/auth';
import { logger } from '@aahar/logging';
import { afterEach, test, vi } from 'vitest';
import type { AuthAuditLogService } from '../common/audit/auth-audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { RedisService } from '../common/redis/redis.service';
import { AuthService } from './auth.service';
import type { RefreshTokenPayload } from './auth.types';
import type { MailService } from './services/mail.service';
import { OtpService } from './services/otp.service';
import type { SmsService } from './services/sms.service';
import { RefreshTokenReusedError, type TokenService } from './services/token.service';

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
});

const permission = (code: string, deletedAt: Date | null = null) => ({ code, deletedAt });

// Asha holds the Kitchen role; one permission is granted to her alone and one taken away.
const asha = {
  deletedAt: null,
  email: 'asha@max.in',
  id: 'user-1',
  mobile: '9876543210',
  name: 'Asha',
  passwordHash: null,
  permissionOverrides: [
    { granted: true, permission: permission('REPORT_VIEW') },
    { granted: false, permission: permission('KOT_CANCEL') },
    { granted: true, permission: permission('RETIRED', new Date()) },
  ],
  roles: [
    {
      role: {
        name: 'Kitchen',
        permissions: [
          { permission: permission('KOT_VIEW') },
          { permission: permission('KOT_CANCEL') },
          { permission: permission('OLD_CODE', new Date()) },
        ],
      },
    },
  ],
  sessionVersion: 3,
  status: 'ACTIVE',
};
// Signs in with a password (set in the password tests).
const meera = {
  ...asha,
  email: 'meera@max.in',
  id: 'user-3',
  mobile: '9000000003',
  passwordHash: null as string | null,
};
// Created in the portal but disabled since: may not sign in.
const ravi = {
  ...asha,
  email: 'ravi@max.in',
  id: 'user-2',
  mobile: '9000000002',
  status: 'DISABLED',
};

function authService(env: Record<string, unknown> = { NODE_ENV: 'test' }) {
  const sms = {
    isConfigured: () => true,
    sendOtp: vi.fn((_mobile: string, _otp: string) => Promise.resolve()),
  };
  const mail = {
    isConfigured: () => true,
    sendOtp: vi.fn((_email: string, _otp: string, _minutes: number) => Promise.resolve()),
  };
  // Kept in a Map with real expiry, so lock windows can run out under fake timers.
  const store = new Map<string, { expiresAt: number; value: string }>();
  const live = (key: string) => {
    const entry = store.get(key);
    if (entry && entry.expiresAt <= Date.now()) store.delete(key);
    return store.get(key);
  };
  const redis = {
    delete: (key: string) => Promise.resolve(live(key) ? store.delete(key) : false),
    get: (key: string) => Promise.resolve(live(key)?.value ?? null),
    increment: (key: string, ttlSeconds: number) => {
      const count = Number(live(key)?.value ?? 0) + 1;
      store.set(key, {
        expiresAt: live(key)?.expiresAt ?? Date.now() + ttlSeconds * 1000,
        value: String(count),
      });
      return Promise.resolve(count);
    },
    setIfAbsent: (key: string, value: string, ttlSeconds: number) => {
      if (live(key)) return Promise.resolve(false);
      store.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
      return Promise.resolve(true);
    },
    setWithExpiry: (key: string, value: string, ttlSeconds: number) => {
      store.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
      return Promise.resolve();
    },
  };
  const otp = new OtpService(
    new ConfigService(env),
    mail as unknown as MailService,
    redis as unknown as RedisService,
    sms as unknown as SmsService,
  );

  // Only active, undeleted portal users are found, the way the where clause asks.
  const users = [asha, meera, ravi];
  const findFirst = vi.fn(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      users.find(
        (user) =>
          user.deletedAt === where.deletedAt &&
          user.status === where.status &&
          ['email', 'id', 'mobile'].every(
            (key) => where[key] === undefined || where[key] === user[key as keyof typeof user],
          ),
      ) ?? null,
    ),
  );
  const executeRaw = vi.fn((..._sql: unknown[]) => Promise.resolve(1));
  // A sign-in moves the user's session version on by one, as the UPDATE … RETURNING does.
  const queryRaw = vi.fn((_sql: unknown, userId: unknown) =>
    Promise.resolve(
      users
        .filter((user) => user.id === userId)
        .map((user) => ({
          sessionVersion: user.sessionVersion + 1,
        })),
    ),
  );
  const prisma = { $executeRaw: executeRaw, $queryRaw: queryRaw, user: { findFirst } };

  const record = vi.fn(
    (_entry: { action: string; entityId?: string; newValue?: unknown; userId?: string }) =>
      Promise.resolve(),
  );
  let refresh: RefreshTokenPayload = { jti: 'jti-1', sub: 'user-1', sv: 3, type: 'refresh' };
  const tokens = {
    issueTokens: vi.fn(
      (
        _user: { permissions: string[]; roles: string[]; sessionVersion: number },
        _authTime?: number,
      ) => Promise.resolve({ accessToken: 'access', refreshToken: 'refresh' }),
    ),
    revokeRefreshToken: vi.fn((_jti: string) => Promise.resolve(true)),
    spendRefreshToken: vi.fn((_payload: RefreshTokenPayload) => Promise.resolve()),
    verifyRefreshToken: vi.fn(() => Promise.resolve(refresh)),
  };

  const service = new AuthService(
    { record } as unknown as AuthAuditLogService,
    otp,
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    tokens as unknown as TokenService,
  );

  return {
    executeRaw,
    findFirst,
    queryRaw,
    mail,
    record,
    service,
    setRefresh: (payload: RefreshTokenPayload) => (refresh = payload),
    sms,
    tokens,
  };
}

test('a code goes out only to a number or email that belongs to an active portal user', async () => {
  const { mail, service, sms } = authService();

  assert.deepEqual(await service.sendOtp({ mobile: '9876543210' }), { channel: 'mobile' });
  assert.deepEqual(await service.sendOtp({ email: 'ASHA@max.in' }), { channel: 'email' });
  assert.equal(sms.sendOtp.mock.calls[0]?.[0], '9876543210');
  assert.equal(mail.sendOtp.mock.calls[0]?.[0], 'asha@max.in');

  await assert.rejects(
    service.sendOtp({ mobile: '9111111111' }),
    (error: unknown) =>
      error instanceof NotFoundException && /mobile number is not registered/.test(error.message),
  );
  await assert.rejects(
    service.sendOtp({ email: 'stranger@max.in' }),
    (error: unknown) =>
      error instanceof NotFoundException && /email is not registered/.test(error.message),
  );
  // A disabled user is treated as unregistered.
  await assert.rejects(service.sendOtp({ mobile: ravi.mobile }), NotFoundException);

  assert.equal(sms.sendOtp.mock.calls.length, 1, 'nothing was sent for the refused numbers');
  assert.equal(mail.sendOtp.mock.calls.length, 1);
});

test('a database outage is not reported as "not registered", and sends nothing', async () => {
  const { findFirst, service, sms } = authService();
  const unreachable = Object.assign(new Error("Can't reach database server at localhost:5433"), {
    code: 'P1001',
  });
  findFirst.mockRejectedValueOnce(unreachable);

  await assert.rejects(
    service.sendOtp({ mobile: '9876543210' }),
    (error: unknown) => error === unreachable,
  );
  assert.equal(sms.sendOtp.mock.calls.length, 0);
});

test('a database outage during password sign-in is not called a wrong password', async () => {
  const { findFirst, service } = authService();
  const unreachable = Object.assign(new Error("Can't reach database server at localhost:5433"), {
    code: 'P1001',
  });
  findFirst.mockRejectedValueOnce(unreachable);

  await assert.rejects(
    service.loginWithPassword({ email: 'asha@max.in', password: 'whatever' }, { ipAddress: '' }),
    (error: unknown) => error === unreachable,
  );
});

test('a refused number does not use up the resend cooldown', async () => {
  const { service } = authService();

  await assert.rejects(service.sendOtp({ mobile: '9111111111' }), NotFoundException);
  await service.sendOtp({ mobile: '9876543210' });
  await assert.rejects(service.sendOtp({ mobile: '9876543210' }), /Please wait 30 seconds/);
});

test('signing in ends the session in any other browser: one browser at a time', async () => {
  const { queryRaw, service, sms, tokens } = authService();
  await service.sendOtp({ mobile: '9876543210' });

  await service.verifyOtp({ mobile: '9876543210', otp: sms.sendOtp.mock.calls[0]?.[1] ?? '' }, {});

  const [sql, userId] = queryRaw.mock.calls[0] ?? [];
  assert.match((sql as string[]).join('?'), /session_version = session_version \+ 1/);
  assert.equal(userId, 'user-1');
  // The new token carries the new version, so tokens issued before it stop working.
  assert.equal(tokens.issueTokens.mock.calls[0]?.[0].sessionVersion, 4);
});

test('verify-otp signs in with the role permissions plus the user’s own overrides', async () => {
  const { record, service, sms, tokens } = authService();
  await service.sendOtp({ mobile: '9876543210' });

  const result = await service.verifyOtp(
    { mobile: '9876543210', otp: sms.sendOtp.mock.calls[0]?.[1] ?? '' },
    { ipAddress: '10.0.0.1' },
  );

  assert.deepEqual(result, { accessToken: 'access', refreshToken: 'refresh' });
  const user = tokens.issueTokens.mock.calls[0]?.[0];
  assert.deepEqual(user?.roles, ['Kitchen']);
  assert.deepEqual(
    [...(user?.permissions ?? [])].sort(),
    ['KOT_VIEW', 'REPORT_VIEW'],
    'granted overrides add, revoked ones remove, deleted permissions count for nothing',
  );
  assert.equal(user?.sessionVersion, 4, 'the token carries the new session version');
  assert.deepEqual(record.mock.calls.find(([event]) => event.action === 'LOGIN_SUCCESS')?.[0], {
    action: 'LOGIN_SUCCESS',
    entityId: 'user-1',
    ipAddress: '10.0.0.1',
    newValue: { channel: 'mobile' },
    userId: 'user-1',
  });
});

test('verify-otp issues nothing for a wrong code or for a user who is no longer active', async () => {
  const { service, sms, tokens } = authService();
  await service.sendOtp({ mobile: '9876543210' });
  const wrong = sms.sendOtp.mock.calls[0]?.[1] === '999999' ? '888888' : '999999';

  await assert.rejects(
    service.verifyOtp({ mobile: '9876543210', otp: wrong }, {}),
    UnauthorizedException,
  );
  // The dev code is refused outside development.
  await assert.rejects(
    service.verifyOtp({ mobile: '9876543210', otp: '000000' }, {}),
    UnauthorizedException,
  );

  // Development accepts 000000, but only for an active portal user.
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const dev = authService({ ALLOW_DEV_OTP: 'true', NODE_ENV: 'development' });
  await assert.rejects(
    dev.service.verifyOtp({ mobile: ravi.mobile, otp: '000000' }, {}),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === 'User is not registered or active',
  );
  await assert.rejects(
    dev.service.verifyOtp({ email: 'stranger@max.in', otp: '000000' }, {}),
    UnauthorizedException,
  );
  assert.ok(await dev.service.verifyOtp({ email: 'Asha@max.in', otp: '000000' }, {}));

  assert.equal(tokens.issueTokens.mock.calls.length, 0);
  assert.equal(dev.tokens.issueTokens.mock.calls.length, 1);
});

test('refresh is refused, and the token revoked, once an admin has changed the user', async () => {
  const { service, setRefresh, tokens } = authService();
  setRefresh({ jti: 'jti-old', sub: 'user-1', sv: 2, type: 'refresh' });

  await assert.rejects(
    service.refresh({ refreshToken: 'r' }, {}),
    (error: unknown) =>
      error instanceof UnauthorizedException && /account was updated/.test(error.message),
  );
  assert.deepEqual(tokens.revokeRefreshToken.mock.calls, [['jti-old']]);
  assert.equal(tokens.issueTokens.mock.calls.length, 0);
});

test('a current refresh token is spent and replaced; a missing version counts as 0', async () => {
  const { record, service, setRefresh, tokens } = authService();

  assert.deepEqual(await service.refresh({ refreshToken: 'r' }, { ipAddress: '10.0.0.1' }), {
    accessToken: 'access',
    refreshToken: 'refresh',
  });
  assert.deepEqual(tokens.spendRefreshToken.mock.calls, [
    [{ jti: 'jti-1', sub: 'user-1', sv: 3, type: 'refresh' }],
  ]);
  assert.equal(tokens.revokeRefreshToken.mock.calls.length, 0);
  assert.equal(tokens.issueTokens.mock.calls[0]?.[0].sessionVersion, 3);
  assert.equal(record.mock.calls[0]?.[0].action, 'SESSION_REFRESHED');

  // Tokens from before session versions existed: valid only while the user is still at 0.
  setRefresh({ jti: 'jti-2', sub: 'user-1', type: 'refresh' });
  await assert.rejects(service.refresh({ refreshToken: 'r' }, {}), UnauthorizedException);

  // A disabled user cannot refresh at all.
  setRefresh({ jti: 'jti-3', sub: 'user-2', sv: 3, type: 'refresh' });
  await assert.rejects(service.refresh({ refreshToken: 'r' }, {}), UnauthorizedException);
  assert.equal(tokens.issueTokens.mock.calls.length, 1);
});

test('signing out revokes the token and ends every session the user has', async () => {
  const { executeRaw, record, service, tokens } = authService();

  assert.deepEqual(await service.logout({ refreshToken: 'r' }, {}), { loggedOut: true });

  assert.deepEqual(tokens.revokeRefreshToken.mock.calls, [['jti-1']]);
  const [sql, userId] = executeRaw.mock.calls[0] ?? [];
  assert.match((sql as string[]).join('?'), /session_version = session_version \+ 1/);
  assert.match((sql as string[]).join('?'), /last_active_at = NULL/);
  assert.equal(userId, 'user-1');
  assert.equal(record.mock.calls[0]?.[0].action, 'LOGOUT');
});

test('a refused code is a LOGIN_FAILED row and warning: number masked, never the code', async () => {
  const { record, service, sms } = authService();
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  await service.sendOtp({ mobile: '9876543210' });
  const sent = sms.sendOtp.mock.calls[0]?.[1] ?? '';
  const wrong = sent === '999999' ? '888888' : '999999';

  await assert.rejects(service.verifyOtp({ mobile: '9876543210', otp: wrong }, {}));

  const failed = record.mock.calls.find(([event]) => event.action === 'LOGIN_FAILED')?.[0];
  assert.deepEqual(failed?.newValue, {
    channel: 'mobile',
    reason: 'invalid_or_expired',
    target: '******3210',
  });
  assert.equal(
    record.mock.calls.find(([event]) => event.action === 'OTP_SENT')?.[0].entityId,
    'user-1',
  );
  assert.equal(warn.mock.calls[0]?.[1], 'login_failed');
  const everything = JSON.stringify([record.mock.calls, warn.mock.calls]);
  for (const secret of ['9876543210', sent, wrong]) {
    assert.ok(!everything.includes(secret), `leaked ${secret}`);
  }
  vi.restoreAllMocks();
});

test('a refresh token used again after it was replaced ends every session the user has', async () => {
  const { executeRaw, record, service, tokens } = authService();

  for (const call of [
    () => service.refresh({ refreshToken: 'r' }, { ipAddress: '10.0.0.1' }),
    () => service.logout({ refreshToken: 'r' }, { ipAddress: '10.0.0.1' }),
  ]) {
    executeRaw.mockClear();
    record.mockClear();
    tokens.verifyRefreshToken.mockRejectedValueOnce(new RefreshTokenReusedError('user-1'));

    await assert.rejects(call(), UnauthorizedException);

    const [sql, userId] = executeRaw.mock.calls[0] ?? [];
    assert.match((sql as string[]).join('?'), /session_version = session_version \+ 1/);
    assert.equal(userId, 'user-1');
    assert.deepEqual(record.mock.calls[0]?.[0], {
      action: 'SESSION_REVOKED',
      entityId: 'user-1',
      ipAddress: '10.0.0.1',
      newValue: { reason: 'refresh_token_reused' },
      userId: 'user-1',
    });
  }
  assert.equal(tokens.issueTokens.mock.calls.length, 0);
});

test('a session signed in over 30 days ago cannot be refreshed; the sign-in time carries over', async () => {
  const { service, setRefresh, tokens } = authService();
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;
  const token = { sub: 'user-1', sv: 3, type: 'refresh' } as const;

  setRefresh({ ...token, authTime: now - 31 * day, iat: now - day, jti: 'jti-old' });
  await assert.rejects(
    service.refresh({ refreshToken: 'r' }, {}),
    (error: unknown) =>
      error instanceof UnauthorizedException && /Please sign in again/.test(error.message),
  );
  assert.deepEqual(tokens.revokeRefreshToken.mock.calls, [['jti-old']]);

  setRefresh({ ...token, authTime: now - 29 * day, iat: now - day, jti: 'jti-2' });
  await service.refresh({ refreshToken: 'r' }, {});
  assert.equal(tokens.issueTokens.mock.calls[0]?.[1], now - 29 * day);

  // Tokens from before the claim existed: their own issue time stands in for the sign-in.
  setRefresh({ ...token, iat: now - 2 * day, jti: 'jti-3' });
  await service.refresh({ refreshToken: 'r' }, {});
  assert.equal(tokens.issueTokens.mock.calls[1]?.[1], now - 2 * day);
});

const lockedOut = (error: unknown) =>
  error instanceof HttpException &&
  error.getStatus() === 429 &&
  /Too many failed sign-in attempts/.test(error.message);
const wrongPassword = (error: unknown) =>
  error instanceof UnauthorizedException && error.message === 'Invalid email or password';

test(
  'ten wrong passwords lock that email for 15 minutes; the right one clears the count',
  { timeout: 30_000 },
  async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    meera.passwordHash = await hashPassword('Meera-right-1');
    const { service } = authService();
    const login = (password: string, email = 'Meera@max.in') =>
      service.loginWithPassword({ email, password }, { ipAddress: '10.0.0.1' });

    for (let attempt = 0; attempt < 9; attempt += 1) {
      await assert.rejects(login('wrong'), wrongPassword);
    }
    assert.ok(await login('Meera-right-1'), 'nine misses do not lock, and success clears them');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await assert.rejects(login('wrong'), wrongPassword);
    }
    await assert.rejects(login('Meera-right-1'), lockedOut);
    // Another account is not held up.
    await assert.rejects(login('wrong', 'asha@max.in'), wrongPassword);

    vi.advanceTimersByTime(14 * 60 * 1000);
    await assert.rejects(login('Meera-right-1'), lockedOut);
    vi.advanceTimersByTime(60 * 1000 + 1);
    assert.ok(await login('Meera-right-1'));
  },
);

test(
  'thirty wrong passwords from one address lock password sign-in from it for 10 minutes',
  { timeout: 30_000 },
  async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    meera.passwordHash = await hashPassword('Meera-right-1');
    const { service } = authService();

    // Spraying: one guess at each of thirty accounts.
    for (let account = 0; account < 30; account += 1) {
      await assert.rejects(
        service.loginWithPassword(
          { email: `user${account}@max.in`, password: 'Summer2026' },
          { ipAddress: '10.0.0.9' },
        ),
        wrongPassword,
      );
    }
    const meeraFrom = (ipAddress: string) =>
      service.loginWithPassword(
        { email: 'meera@max.in', password: 'Meera-right-1' },
        { ipAddress },
      );
    await assert.rejects(meeraFrom('10.0.0.9'), lockedOut);
    assert.ok(await meeraFrom('10.0.0.10'), 'another address is not held up');

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    assert.ok(await meeraFrom('10.0.0.9'));
  },
);

/** The new password hash the reset wrote, read from its UPDATE. */
const resetHash = (executeRaw: ReturnType<typeof authService>['executeRaw']) => {
  const call = executeRaw.mock.calls.find(([sql]) =>
    (sql as readonly string[]).join('?').includes('password_hash'),
  );
  return call ? { hash: call[1] as string, userId: call.at(-1) } : undefined;
};

test(
  'a forgotten password is reset with a code sent to the email: sessions end, the lock lifts',
  { timeout: 30_000 },
  async () => {
    meera.passwordHash = await hashPassword('Meera-old-1');
    const { executeRaw, mail, record, service } = authService();
    const login = (password: string) =>
      service.loginWithPassword({ email: 'meera@max.in', password }, { ipAddress: '10.0.0.1' });

    // Ten wrong guesses lock password sign-in, the usual state of someone who forgot it.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await assert.rejects(login('guess'), wrongPassword);
    }
    await assert.rejects(login('Meera-old-1'), lockedOut);

    await service.sendOtp({ email: 'meera@max.in' });
    const code = mail.sendOtp.mock.calls[0]?.[1] as string;

    assert.deepEqual(
      await service.resetPassword(
        { email: 'Meera@Max.in', newPassword: 'Meera-new-2', otp: code },
        { ipAddress: '10.0.0.1' },
      ),
      { reset: true },
    );

    const written = resetHash(executeRaw);
    assert.ok(written, 'the password was written');
    assert.equal(written.userId, 'user-3');
    assert.ok(await verifyPassword('Meera-new-2', written.hash));
    // The same UPDATE moves the session version on, so every device signs in again.
    assert.match(
      (
        executeRaw.mock.calls.find(([sql]) =>
          (sql as readonly string[]).join('?').includes('password_hash'),
        )?.[0] as readonly string[]
      ).join('?'),
      /session_version = session_version \+ 1/,
    );
    assert.ok(
      record.mock.calls.some(
        ([entry]) => entry.action === 'PASSWORD_CHANGED' && entry.userId === 'user-3',
      ),
    );

    meera.passwordHash = written.hash;
    assert.ok(await login('Meera-new-2'), 'the new password signs in at once: the lock is gone');

    // A code works once.
    await assert.rejects(
      service.resetPassword(
        { email: 'meera@max.in', newPassword: 'Meera-new-3', otp: code },
        { ipAddress: '10.0.0.1' },
      ),
      UnauthorizedException,
    );
  },
);

test('a wrong code or an unregistered email changes no password', async () => {
  meera.passwordHash = await hashPassword('Meera-old-1');
  const { executeRaw, service } = authService();

  await service.sendOtp({ email: 'meera@max.in' });
  await assert.rejects(
    service.resetPassword({ email: 'meera@max.in', newPassword: 'Meera-new-2', otp: '000001' }, {}),
    UnauthorizedException,
  );
  await assert.rejects(
    service.resetPassword(
      { email: 'nobody@max.in', newPassword: 'Meera-new-2', otp: '123456' },
      {},
    ),
    UnauthorizedException,
  );
  assert.equal(resetHash(executeRaw), undefined);
});
