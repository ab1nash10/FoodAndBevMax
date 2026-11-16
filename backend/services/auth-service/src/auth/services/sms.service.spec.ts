import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logger } from '@aahar/logging';
import { SmsService } from './sms.service';
import { test, vi } from 'vitest';

const config = new ConfigService({
  // Padded the way a Secret made with `echo … | base64` pads it.
  SMS_PASSWORD: ' p@ss:word\n',
  SMS_SENDER_ID: 'MAXHSP',
  SMS_USERNAME: 'Max_Health_abc\n',
});
const sms = new SmsService(config);
let requested: { init: RequestInit; url: string } | undefined;
let reply = { body: '', status: 200 };

globalThis.fetch = ((url: string, init: RequestInit) => {
  requested = { init, url };
  return Promise.resolve(new Response(reply.body, { status: reply.status }));
}) as typeof fetch;

test('SmsService sends through Airtel IQ and fails closed', async () => {
  assert.equal(sms.isConfigured(), true);
  assert.equal(new SmsService(new ConfigService({ SMS_USERNAME: 'x' })).isConfigured(), false);

  reply = { body: '{"messageRequestId":"1"}', status: 200 };
  await sms.sendOtp('8178201584', '042917');

  assert.equal(requested?.url, 'https://iqsms.airtel.in/api/v1/send-sms');
  assert.equal(requested?.init.method, 'POST');
  const headers = new Headers(requested?.init.headers);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(
    headers.get('authorization'),
    `Basic ${Buffer.from('Max_Health_abc:p@ss:word').toString('base64')}`,
    'Basic login from the trimmed username and password',
  );
  const body = JSON.parse(requested?.init.body as string) as Record<string, unknown>;
  assert.deepEqual(body, {
    customerId: 'Max_Health_abc',
    destinationAddress: '8178201584',
    dltTemplateId: '1177179007636464708',
    entityId: '1401730220000010116',
    message:
      'Dear User, 042917 is your OTP for logging into App Name valid for 5 minutes. Please do not share this OTP with anyone. Thanks, Max Healthcare',
    messageType: 'SERVICE_IMPLICIT',
    otp: true,
    sourceAddress: 'MAXHSP',
  });

  // A number Airtel will not text comes back as HTTP 200 with it listed in incorrectNum.
  reply = { body: '{"incorrectNum":["8178201584"],"messageRequestId":"2"}', status: 200 };
  await assert.rejects(sms.sendOtp('8178201584', '1'), ServiceUnavailableException);

  const logged = vi.spyOn(logger, 'error');
  reply = { body: '{"code":"401","message":"Dear User, 042917 rejected"}', status: 401 };
  await assert.rejects(sms.sendOtp('8178201584', '042917'), ServiceUnavailableException);
  assert.ok(!JSON.stringify(logged.mock.calls).includes('042917'), 'the code is never logged');
  assert.match(JSON.stringify(logged.mock.calls), /401/);

  globalThis.fetch = () => Promise.reject(new Error('ECONNRESET'));
  await assert.rejects(sms.sendOtp('8178201584', '1'), ServiceUnavailableException);
});
