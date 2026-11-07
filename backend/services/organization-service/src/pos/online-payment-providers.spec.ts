import { strict as assert } from 'node:assert';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { test } from 'vitest';
import { locationProviders, paymentProviders, pinelabs } from './online-payment-providers';

// Fake keys only: no call leaves the test, fetch answers from `answer`.
const razorpayKeys = { RAZORPAY_KEY_ID: 'rzp_test_fake', RAZORPAY_KEY_SECRET: 'fake-secret' };
const payuKeys = {
  PAYU_BASE_URL: 'https://payu.example.test',
  PAYU_CLIENT_ID: 'payu-client',
  PAYU_CLIENT_SECRET: 'payu-secret',
  PAYU_MERCHANT_ID: 'merchant-1',
  PAYU_TOKEN_URL: 'https://payu.example.test/oauth/token',
};

interface Call {
  body: string;
  headers: Record<string, string>;
  method: string;
  url: string;
}

let calls: Call[] = [];
let answer: (url: string) => Response | null = () => Response.json({});

globalThis.fetch = ((url: string, init: RequestInit = {}) => {
  calls.push({
    body: (init.body as string | undefined) ?? '',
    headers: (init.headers ?? {}) as Record<string, string>,
    method: init.method ?? 'GET',
    url,
  });
  const response = answer(url);
  // null stands for the provider not answering at all.
  return response ? Promise.resolve(response) : Promise.reject(new Error('timed out'));
}) as typeof fetch;

function provider(name: 'PAYU' | 'RAZORPAY') {
  calls = [];
  return paymentProviders(new ConfigService({ ...razorpayKeys, ...payuKeys })).get(name)!;
}

test('a new link without a url or id is refused, not saved as "undefined"', async () => {
  answer = () => Response.json({ id: 'plink_1' });
  await assert.rejects(
    provider('RAZORPAY').create({ amount: 10, description: 'x', reference: 'y' }),
    (error: unknown) =>
      error instanceof BadGatewayException &&
      /Razorpay did not send a payment link/.test(error.message),
  );

  answer = payuAnswer({ paymentLink: 'https://payu.example.test/l/9' });
  await assert.rejects(
    provider('PAYU').create({ amount: 10, description: 'x', reference: 'y' }),
    BadGatewayException,
  );
});

test('only providers with every key set are offered', () => {
  const offered = (values: Record<string, string>) => [
    ...paymentProviders(new ConfigService(values)).keys(),
  ];

  assert.deepEqual(offered({}), []);
  assert.deepEqual(offered(razorpayKeys), ['RAZORPAY']);
  assert.deepEqual(offered({ ...razorpayKeys, RAZORPAY_KEY_SECRET: '   ' }), []);
  assert.deepEqual(offered({ ...payuKeys, PAYU_MERCHANT_ID: '' }), []);
  assert.deepEqual(offered({ ...payuKeys, ...razorpayKeys }), ['RAZORPAY', 'PAYU']);
});

test('Razorpay is asked for a link in paise, with Basic auth from the key id and secret', async () => {
  const razorpay = provider('RAZORPAY');
  answer = () => Response.json({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' });

  const link = await razorpay.create({
    amount: 123.45,
    description: 'Cafe · Till 1',
    reference: 'pay-1',
  });

  assert.deepEqual(link, { paymentUrl: 'https://rzp.io/i/abc', providerRef: 'plink_1' });
  const [call] = calls;
  assert.equal(call!.url, 'https://api.razorpay.com/v1/payment_links');
  assert.equal(call!.method, 'POST');
  assert.equal(
    call!.headers.authorization,
    `Basic ${Buffer.from('rzp_test_fake:fake-secret').toString('base64')}`,
  );
  assert.deepEqual(JSON.parse(call!.body), {
    amount: 12345,
    currency: 'INR',
    description: 'Cafe · Till 1',
    reference_id: 'pay-1',
  });
});

test('a Razorpay link reads as paid, closed or still open from its status', async () => {
  const razorpay = provider('RAZORPAY');

  answer = () => Response.json({ payments: [{ payment_id: 'pay_XYZ' }], status: 'paid' });
  assert.deepEqual(await razorpay.read('plink_1'), {
    closed: false,
    paid: true,
    reference: 'pay_XYZ',
  });
  assert.equal(calls[0]!.url, 'https://api.razorpay.com/v1/payment_links/plink_1');

  for (const status of ['cancelled', 'expired']) {
    answer = () => Response.json({ status });
    assert.deepEqual(await razorpay.read('plink_1'), {
      closed: true,
      paid: false,
      reference: null,
    });
  }

  answer = () => Response.json({ status: 'created' });
  assert.deepEqual(await razorpay.read('plink_1'), { closed: false, paid: false, reference: null });

  await razorpay.cancel('plink_1', 10);
  const last = calls.at(-1)!;
  assert.equal(last.url, 'https://api.razorpay.com/v1/payment_links/plink_1/cancel');
  assert.equal(last.method, 'POST');
});

test('a refusal passes on the provider’s reason; no answer at all is a service outage', async () => {
  const razorpay = provider('RAZORPAY');

  answer = () =>
    Response.json({ error: { description: 'Authentication failed' } }, { status: 401 });
  await assert.rejects(
    razorpay.read('plink_1'),
    (error: unknown) =>
      error instanceof BadGatewayException &&
      error.message === 'Razorpay refused it: Authentication failed',
  );

  // A body that is not JSON still names the HTTP status.
  answer = () => new Response('<html>Bad gateway</html>', { status: 502 });
  await assert.rejects(
    razorpay.read('plink_1'),
    (error: unknown) => error instanceof BadGatewayException && /HTTP 502/.test(error.message),
  );

  answer = () => null;
  await assert.rejects(
    razorpay.create({ amount: 10, description: 'x', reference: 'y' }),
    (error: unknown) =>
      error instanceof ServiceUnavailableException && /Razorpay did not answer/.test(error.message),
  );
});

const payuAnswer =
  (result: Record<string, unknown>, expiresIn = 7200) =>
  (url: string) =>
    url === payuKeys.PAYU_TOKEN_URL
      ? Response.json({ access_token: `token-${calls.length}`, expires_in: expiresIn })
      : Response.json({ result, status: 0 });

test('PayU takes a client-credentials token once and reuses it for links in rupees', async () => {
  const payu = provider('PAYU');
  answer = payuAnswer({ invoiceNumber: 'INV-9', paymentLink: 'https://payu.example.test/l/9' });

  const link = await payu.create({
    amount: 250.5,
    description: 'Cafe · Till 1',
    reference: 'pay-1',
  });
  assert.deepEqual(link, { paymentUrl: 'https://payu.example.test/l/9', providerRef: 'INV-9' });
  await payu.read('INV-9');

  const [token, create, read] = calls;
  assert.equal(token!.url, payuKeys.PAYU_TOKEN_URL);
  assert.deepEqual(JSON.parse(token!.body), {
    client_id: 'payu-client',
    client_secret: 'payu-secret',
    grant_type: 'client_credentials',
    scope: 'create_payment_links read_payment_links',
  });
  assert.equal(create!.url, 'https://payu.example.test/payment-links/');
  assert.equal(create!.headers.authorization, 'Bearer token-1');
  assert.equal(create!.headers.merchantId, 'merchant-1');
  assert.deepEqual(JSON.parse(create!.body), {
    description: 'Cafe · Till 1',
    isPartialPaymentAllowed: false,
    source: 'API',
    subAmount: 250.5,
  });
  assert.equal(read!.url, 'https://payu.example.test/payment-links/INV-9');
  assert.equal(read!.headers.authorization, 'Bearer token-1');
  assert.equal(calls.length, 3, 'no second token while the first is good');
});

test('a PayU token about to run out is renewed before the next call', async () => {
  const payu = provider('PAYU');
  // Under a minute left counts as expired.
  answer = payuAnswer({ dueAmount: 10, status: 'active', totalAmountCollected: 0 }, 30);

  await payu.read('INV-9');
  await payu.read('INV-9');

  assert.equal(calls.filter((call) => call.url === payuKeys.PAYU_TOKEN_URL).length, 2);
});

test('a PayU link is paid once nothing is due and money came in; inactive unpaid is closed', async () => {
  const payu = provider('PAYU');

  answer = payuAnswer({
    dueAmount: 0,
    status: 'paid',
    totalAmountCollected: 250.5,
    transactionId: 'TXN-1',
  });
  assert.deepEqual(await payu.read('INV-9'), { closed: false, paid: true, reference: 'TXN-1' });

  // Paid with no transaction id: the link's own number stands in.
  answer = payuAnswer({ dueAmount: 0, status: 'paid', totalAmountCollected: 250.5 });
  assert.deepEqual(await payu.read('INV-9'), { closed: false, paid: true, reference: 'INV-9' });

  answer = payuAnswer({ dueAmount: 250.5, status: 'active', totalAmountCollected: 0 });
  assert.deepEqual(await payu.read('INV-9'), { closed: false, paid: false, reference: null });

  answer = payuAnswer({ dueAmount: 250.5, status: 'expired', totalAmountCollected: 0 });
  assert.deepEqual(await payu.read('INV-9'), { closed: true, paid: false, reference: null });

  // An unknown status or an empty reply keeps the link open for the next check.
  for (const result of [{ dueAmount: 250.5, status: 'processing' }, {}]) {
    answer = payuAnswer(result);
    assert.deepEqual(await payu.read('INV-9'), { closed: false, paid: false, reference: null });
  }

  // PayU's link API has no cancel: it calls nobody.
  const before = calls.length;
  await payu.cancel('INV-9', 10);
  assert.equal(calls.length, before);
});

test('PayU’s refusal inside a 200 answer is still a refusal', async () => {
  const payu = provider('PAYU');
  answer = (url) =>
    url === payuKeys.PAYU_TOKEN_URL
      ? Response.json({ access_token: 't', expires_in: 7200 })
      : Response.json({ message: 'Invalid merchant', status: -1 });

  await assert.rejects(
    payu.create({ amount: 10, description: 'x', reference: 'y' }),
    (error: unknown) =>
      error instanceof BadGatewayException && error.message === 'PayU refused it: Invalid merchant',
  );
});

// Pine Labs Plutus Cloud: the till's card machine takes the payment. Fake machine, fake base url.
const machine = {
  imei: 'TEST-IMEI',
  merchantId: '29610',
  merchantStorePosCode: '1221258437',
  securityToken: 'fake-token',
};
const plutus = () => {
  calls = [];
  return pinelabs('https://plutus.example.test/V1', machine);
};
const sent = (index = 0) => JSON.parse(calls[index]!.body) as Record<string, unknown>;

test('Pine Labs: a payment goes to the machine in paise, for cards, under a short bill number', async () => {
  answer = () =>
    Response.json({
      ResponseCode: 0,
      ResponseMessage: 'APPROVED',
      PlutusTransactionReferenceID: 823486,
    });

  const started = await plutus().create({
    amount: 105.5,
    description: 'Cafe · Till 1',
    reference: '0f8e2c1a-9b7d-4e6f-a1b2-c3d4e5f60718',
  });

  assert.deepEqual(started, { paymentUrl: '', providerRef: '823486' });
  assert.equal(calls[0]!.url, 'https://plutus.example.test/V1/UploadBilledTransaction');
  assert.deepEqual(sent(), {
    AllowedPaymentMode: '1',
    Amount: 10550,
    AutoCancelDurationInMinutes: 5,
    IMEI: 'TEST-IMEI',
    MerchantID: '29610',
    MerchantStorePosCode: '1221258437',
    SecurityToken: 'fake-token',
    SequenceNumber: 1,
    TransactionNumber: '0f8e2c1a9b7d4e6fa1b2',
    UserID: '',
  });
});

test('Pine Labs: a refused upload passes its message on and saves nothing', async () => {
  answer = () =>
    Response.json({
      ResponseCode: 1,
      ResponseMessage: 'INVALID IMEI',
      PlutusTransactionReferenceID: -1,
    });

  await assert.rejects(
    plutus().create({ amount: 10, description: 'x', reference: 'y' }),
    (error: unknown) =>
      error instanceof BadGatewayException &&
      /Pine Labs refused it: INVALID IMEI/.test(error.message),
  );

  answer = () => null;
  await assert.rejects(
    plutus().create({ amount: 10, description: 'x', reference: 'y' }),
    (error: unknown) =>
      error instanceof ServiceUnavailableException &&
      /Pine Labs did not answer/.test(error.message),
  );
});

test('Pine Labs: the status settles as paid, closed, or still waiting on the machine', async () => {
  const status = (body: Record<string, unknown>) => {
    answer = () => Response.json(body);
    return plutus().read('823486');
  };

  assert.deepEqual(
    await status({
      ResponseCode: 0,
      ResponseMessage: 'TXN APPROVED',
      TransactionData: [
        { Tag: 'TID', Value: '12345678' },
        { Tag: 'ApprovalCode', Value: '00A1B2' },
        { Tag: 'RRN', Value: '530112345678' },
      ],
    }),
    { closed: false, paid: true, reference: '530112345678' },
  );
  assert.deepEqual(sent(), { ...pick(machine), PlutusTransactionReferenceID: 823486 });
  // Approved without card data: the Plutus reference stands in for it.
  assert.deepEqual(await status({ ResponseCode: 0, ResponseMessage: 'TXN APPROVED' }), {
    closed: false,
    paid: true,
    reference: '823486',
  });
  // Only an approval is paid: a refusal worded with "APPROVED" in it is not.
  for (const message of ['NOT APPROVED', 'TXN NOT APPROVED', 'APPROVED? NO']) {
    assert.equal((await status({ ResponseCode: 0, ResponseMessage: message })).paid, false);
  }
  assert.equal((await status({ ResponseCode: 0, ResponseMessage: ' approved ' })).paid, true);
  assert.deepEqual(await status({ ResponseCode: 1001, ResponseMessage: 'TXN UPLOADED' }), {
    closed: false,
    paid: false,
    reference: null,
  });
  for (const message of ['TXN CANCELLED', 'TXN DECLINED', 'TXN EXPIRED', 'TRANSACTION FAILED']) {
    assert.equal(
      (await status({ ResponseCode: 1, ResponseMessage: message })).closed,
      true,
      message,
    );
  }
  // An error that says nothing about the payment keeps it waiting: never closed by a hiccup.
  assert.deepEqual(await status({ ResponseCode: 1, ResponseMessage: 'ERROR' }), {
    closed: false,
    paid: false,
    reference: null,
  });
});

test('Pine Labs: cancelling clears the machine, unless the guest has just paid', async () => {
  answer = () => Response.json({ ResponseCode: 0, ResponseMessage: 'APPROVED' });
  const provider = plutus();
  await provider.cancel('823486', 105.5);
  assert.equal(calls[0]!.url, 'https://plutus.example.test/V1/CancelTransaction');
  assert.equal(sent().PlutusTransactionReferenceID, 823486);
  assert.equal(sent().Amount, 10550);
  assert.equal(sent().TakeToHomeScreen, true);

  // Refused because it went through: the cancel fails so the payment is read as paid.
  answer = (url) =>
    url.endsWith('/CancelTransaction')
      ? Response.json({ ResponseCode: 1, ResponseMessage: 'TXN ALREADY APPROVED' })
      : Response.json({ ResponseCode: 0, ResponseMessage: 'TXN APPROVED' });
  await assert.rejects(plutus().cancel('823486', 10), BadGatewayException);

  // Refused because there is nothing left on the machine: it is gone either way.
  answer = (url) =>
    url.endsWith('/CancelTransaction')
      ? Response.json({ ResponseCode: 1, ResponseMessage: 'TRANSACTION NOT FOUND' })
      : Response.json({ ResponseCode: 1, ResponseMessage: 'TXN CANCELLED' });
  await plutus().cancel('823486', 10);
});

function pick(settings: typeof machine) {
  return {
    IMEI: settings.imei,
    MerchantID: settings.merchantId,
    MerchantStorePosCode: settings.merchantStorePosCode,
    SecurityToken: settings.securityToken,
  };
}

const noKeys = {
  payuClientId: null,
  payuClientSecret: null,
  payuMerchantId: null,
  razorpayKeyId: null,
  razorpayKeySecret: null,
};

test('a location offers only the gateway it picked: with its own keys, else the shared ones', async () => {
  const shared = new ConfigService({ ...razorpayKeys, ...payuKeys });
  const offered = (location: Parameters<typeof locationProviders>[1], config = shared) => [
    ...locationProviders(config, location).keys(),
  ];

  assert.deepEqual(offered({ ...noKeys, onlinePaymentOption: 'NONE' }), []);
  assert.deepEqual(offered({ ...noKeys, onlinePaymentOption: 'PAYU' }), ['PAYU']);
  assert.deepEqual(offered({ ...noKeys, onlinePaymentOption: 'RAZORPAY' }), ['RAZORPAY']);
  // Picked, but no keys anywhere: nothing to offer.
  assert.deepEqual(
    offered({ ...noKeys, onlinePaymentOption: 'RAZORPAY' }, new ConfigService({})),
    [],
  );

  // Its own Razorpay keys are the ones used.
  calls = [];
  answer = () => Response.json({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' });
  await locationProviders(shared, {
    ...noKeys,
    onlinePaymentOption: 'RAZORPAY',
    razorpayKeyId: 'rzp_live_site',
    razorpayKeySecret: 'site-secret',
  })
    .get('RAZORPAY')!
    .create({ amount: 1, description: 'x', reference: 'y' });
  assert.equal(
    calls[0]!.headers.authorization,
    `Basic ${Buffer.from('rzp_live_site:site-secret').toString('base64')}`,
  );

  // Its own PayU account, on the shared PayU endpoints; a half-filled one falls back to shared.
  calls = [];
  answer = payuAnswer({ invoiceNumber: 'INV1', paymentLink: 'https://payu.example.test/l/1' });
  await locationProviders(shared, {
    ...noKeys,
    onlinePaymentOption: 'PAYU',
    payuClientId: 'site-client',
    payuClientSecret: 'site-payu-secret',
    payuMerchantId: 'site-merchant',
  })
    .get('PAYU')!
    .create({ amount: 1, description: 'x', reference: 'y' });
  assert.match(calls[0]!.body, /site-client/);
  assert.equal(calls[1]!.headers.merchantId, 'site-merchant');
});
