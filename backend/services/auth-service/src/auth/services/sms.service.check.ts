/**
 * Self-check for the SMS gateway client, with fetch stubbed so nothing is sent:
 *
 *   pnpm exec tsx --tsconfig backend/services/auth-service/tsconfig.json backend/services/auth-service/src/auth/services/sms.service.check.ts
 */
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

const config = new ConfigService({
  SMS_FEED_ID: '354105',
  // Padded the way a Secret made with `echo … | base64` pads it.
  SMS_PASSWORD: ' p@ss word\n',
  SMS_SENDER_ID: 'MAXHSP',
  SMS_USERNAME: '9000000000\n',
});
const sms = new SmsService(config);
let requested = '';
let reply = { body: '', status: 200 };

globalThis.fetch = ((url: string) => {
  requested = url;
  return Promise.resolve(new Response(reply.body, { status: reply.status }));
}) as typeof fetch;

async function main(): Promise<void> {
  assert.equal(sms.isConfigured(), true);
  assert.equal(new SmsService(new ConfigService({ SMS_FEED_ID: '1' })).isConfigured(), false);

  reply = { body: '<RESULT REQID="1"><MID ID="1" TID="2"></MID></RESULT>', status: 200 };
  await sms.sendOtp('8178201584', '042917');

  const url = new URL(requested);
  assert.equal(url.origin + url.pathname, 'https://bulkpush.mytoday.com/BulkSms/SingleMsgApi');
  assert.equal(url.searchParams.get('To'), '8178201584');
  assert.equal(
    url.searchParams.get('password'),
    'p@ss word',
    'credentials survive encoding, and stray whitespace from a Secret is trimmed',
  );
  assert.equal(url.searchParams.get('senderid'), 'MAXHSP');
  assert.match(url.searchParams.get('Text') ?? '', /^Dear User, 042917 is your OTP for logging/);
  assert.ok(requested.includes('Dear%20User%2C%20042917'), 'spaces as %20, like the sample');
  assert.ok(!requested.includes('+'), 'no form-style + for spaces');

  // The gateway reports failures as HTTP 200 with an ERROR block.
  reply = {
    body: '<RESULT><REQUEST-ERROR><ERROR><CODE>122</CODE><DESC>Authentication failure</DESC></ERROR></REQUEST-ERROR></RESULT>',
    status: 200,
  };
  await assert.rejects(sms.sendOtp('8178201584', '1'), ServiceUnavailableException);

  reply = { body: 'down', status: 503 };
  await assert.rejects(sms.sendOtp('8178201584', '1'), ServiceUnavailableException);

  globalThis.fetch = () => Promise.reject(new Error('ECONNRESET'));
  await assert.rejects(sms.sendOtp('8178201584', '1'), ServiceUnavailableException);

  console.log('sms.service self-check passed');
}

void main();
