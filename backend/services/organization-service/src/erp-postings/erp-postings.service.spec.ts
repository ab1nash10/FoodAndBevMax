import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, test, vi } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { ReportsService } from '../reports/reports.service';
import { ErpPostingsService } from './erp-postings.service';

const hospitalId = '11111111-1111-4111-8111-111111111111';
const restaurantId = '22222222-2222-4222-8222-222222222222';
const user = { allowedHospitalIds: null, id: '33333333-3333-4333-8333-333333333333' };
const line = { AFS_11: 'MAXJPE/1', AMOUNT: 10, JRNAL_TYPE: 'ZHI01', MEMO_AMT: 0, UNQ_ID: 0 };

function setup({
  configured = true,
  rows = [line, { ...line, AFS_11: 'MAXJPE/2' }],
  sentBefore = false,
}: { configured?: boolean; rows?: object[]; sentBefore?: boolean } = {}) {
  const saved: Array<Record<string, unknown>> = [];
  const prisma = {
    erpPosting: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { createdAt: new Date(), id: `p${saved.length + 1}`, ...data };
        saved.push(row);
        return Promise.resolve(row);
      }),
      findFirst: vi.fn(() =>
        Promise.resolve(
          sentBefore ? { createdAt: new Date('2026-10-30T10:00:00Z'), id: 'old' } : null,
        ),
      ),
      update: vi.fn(({ data, where }: { data: object; where: { id: string } }) => {
        const row = saved.find((entry) => entry.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
    restaurant: {
      findFirst: vi.fn(() => Promise.resolve({ restaurantName: 'LXF Food Trolley' })),
      findMany: vi.fn(() =>
        Promise.resolve([{ id: restaurantId, restaurantName: 'LXF Food Trolley' }]),
      ),
    },
    user: { findMany: vi.fn(() => Promise.resolve([{ id: user.id, name: 'Abinash' }])) },
  };
  const reports = { run: vi.fn(() => Promise.resolve({ rows, title: 'ERP Journal (SUN)' })) };
  const settings: Record<string, string> = configured
    ? { ERP_REVENUE_TOKEN: 'secret-token', ERP_REVENUE_URL: 'https://erp.test/api/fnb/revenue' }
    : {};
  const config = { get: (key: string) => settings[key] };
  const audit = { record: vi.fn(() => Promise.resolve(undefined)) };
  const service = new ErpPostingsService(
    prisma as unknown as PrismaService,
    reports as unknown as ReportsService,
    config as unknown as ConfigService,
    audit as never,
  );

  return { audit, prisma, reports, saved, service };
}

const day = { businessDate: '2026-10-31', hospitalId, restaurantId };

afterEach(() => vi.unstubAllGlobals());

test('not set up: nothing is sent and the admin is told why', async () => {
  const { service } = setup({ configured: false });

  assert.equal(service.enabled(), false);
  await assert.rejects(service.send(day, user), ServiceUnavailableException);
});

test('a day is sent only once it is over', async () => {
  const { service } = setup();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  await assert.rejects(service.send({ ...day, businessDate: today }, user), BadRequestException);
});

test('the day’s journal goes to the ERP with the token, and the answer is kept', async () => {
  const fetch = vi.fn(() => Promise.resolve(new Response('{"success":true,"returnValue":1}')));
  vi.stubGlobal('fetch', fetch);
  const { audit, reports, saved, service } = setup();

  const posting = await service.send(day, user);

  assert.equal(posting.status, 'SUCCESS');
  assert.equal(posting.billCount, 2);
  assert.equal(posting.rowCount, 2);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  assert.equal(url, 'https://erp.test/api/fnb/revenue');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer secret-token');
  assert.equal(
    (JSON.parse(init.body as string) as { fnBRevenueList: unknown[] }).fnBRevenueList.length,
    2,
  );
  // The kept request never holds the token.
  assert.ok(!JSON.stringify(saved).includes('secret-token'));
  assert.equal(saved[0]!.responseStatus, 200);
  // The ERP Journal report for that restaurant and that day (midnight to midnight, India).
  assert.deepEqual((reports.run.mock.calls[0] as unknown[]).slice(0, 2), [
    'erp',
    {
      from: '2026-10-31T00:00:00+05:30',
      hospitalId,
      restaurantIds: restaurantId,
      to: '2026-11-01T00:00:00+05:30',
    },
  ]);
  assert.equal(
    (audit.record.mock.calls[0] as unknown as [{ action: string }])[0].action,
    'ERP_POST',
  );
});

test('a refusal or a dead line is recorded as failed, with the reason', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{"success":false,"message":"Bad period"}'))),
  );
  const first = setup();
  assert.equal((await first.service.send(day, user)).status, 'FAILED');
  assert.equal(first.saved[0]!.error, 'Bad period');

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Promise.reject(new Error('connect ETIMEDOUT'))),
  );
  const second = setup();
  const posting = await second.service.send(day, user);
  assert.equal(posting.status, 'FAILED');
  assert.match(String(second.saved[0]!.error), /ETIMEDOUT/);
});

test('a day already in the ERP is sent again only when asked', async () => {
  const fetch = vi.fn(() => Promise.resolve(new Response('{"success":true}')));
  vi.stubGlobal('fetch', fetch);
  const { service } = setup({ sentBefore: true });

  await assert.rejects(service.send(day, user), ConflictException);
  assert.equal(fetch.mock.calls.length, 0);
  assert.equal((await service.send({ ...day, resend: true }, user)).status, 'SUCCESS');
});

test('a day without bills is recorded, and the ERP is not called', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { service } = setup({ rows: [] });

  assert.equal((await service.send(day, user)).status, 'EMPTY');
  assert.equal(fetch.mock.calls.length, 0);
});
