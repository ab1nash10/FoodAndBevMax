import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { test } from 'vitest';
import { MailService } from './mail.service';

const config = new ConfigService({
  MAIL_CLIENT_ID: 'client-id',
  // Padded the way a Secret made with `echo … | base64` pads it.
  MAIL_CLIENT_SECRET: 's3cret\n',
  MAIL_SENDER: 'homecare@example.com',
  MAIL_TENANT_ID: 'tenant-id',
});
const calls: Array<{ body: string; url: string }> = [];
let sendStatus = 202;

globalThis.fetch = ((url: string, init: RequestInit) => {
  // The sender only ever posts a JSON string or URLSearchParams.
  calls.push({ body: (init.body as string | URLSearchParams | undefined)?.toString() ?? '', url });

  if (url.includes('/oauth2/v2.0/token')) {
    return Promise.resolve(
      Response.json({ access_token: 'token-1', expires_in: 3600, token_type: 'Bearer' }),
    );
  }

  return Promise.resolve(
    sendStatus === 202
      ? new Response(null, { status: 202 })
      : Response.json({ error: { code: 'ErrorAccessDenied' } }, { status: sendStatus }),
  );
}) as typeof fetch;

test('MailService sends the code through Graph, reuses its token, and fails closed', async () => {
  const mail = new MailService(config);
  assert.equal(mail.isConfigured(), true);
  assert.equal(new MailService(new ConfigService({ MAIL_CLIENT_ID: 'x' })).isConfigured(), false);

  await mail.sendOtp('user@example.com', '042917', 5);
  const [tokenCall, sendCall] = calls;
  assert.equal(tokenCall!.url, 'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token');
  const form = new URLSearchParams(tokenCall!.body);
  assert.equal(form.get('grant_type'), 'client_credentials');
  assert.equal(form.get('client_secret'), 's3cret', 'stray whitespace from a Secret is trimmed');
  assert.equal(form.get('scope'), 'https://graph.microsoft.com/.default');
  assert.equal(
    sendCall!.url,
    'https://graph.microsoft.com/v1.0/users/homecare%40example.com/sendMail',
  );
  const message = JSON.parse(sendCall!.body) as {
    message: { body: { content: string }; subject: string; toRecipients: unknown[] };
    saveToSentItems: boolean;
  };
  assert.deepEqual(message.message.toRecipients, [
    { emailAddress: { address: 'user@example.com' } },
  ]);
  assert.match(message.message.subject, /^042917 is your AAHAR sign-in code$/);
  assert.match(message.message.body.content, /valid for 5 minutes/);
  assert.equal(message.saveToSentItems, false);

  // A second code within the token's life asks for no new token.
  await mail.sendOtp('user@example.com', '111111', 5);
  assert.equal(calls.filter((call) => call.url.includes('/oauth2/')).length, 1);

  sendStatus = 403;
  await assert.rejects(mail.sendOtp('user@example.com', '222222', 5), ServiceUnavailableException);
});
