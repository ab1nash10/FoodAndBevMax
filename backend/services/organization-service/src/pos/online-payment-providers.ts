import { createHash } from 'node:crypto';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { OnlinePaymentProvider, Prisma } from '@prisma/client';
import { openField } from '../common/field-crypto';

/** A payment page the guest opens from the till's QR, and the provider's id for it. */
export interface ProviderLink {
  paymentUrl: string;
  providerRef: string;
}

/** Where a link stands: paid (with the provider's payment id), closed unpaid, or still open. */
export interface ProviderState {
  closed: boolean;
  paid: boolean;
  reference: string | null;
}

export interface PaymentProvider {
  /** amount: what the payment was for, in rupees (Pine Labs needs it to clear the machine). */
  cancel(providerRef: string, amount: number): Promise<void>;
  /**
   * returnUrl: where the provider sends a guest who paid on their own phone (QR orders).
   * customer: the payer, when given. embedded: paid in the provider's checkout on our own page
   * (Razorpay: an order, no link page); paymentUrl is then empty.
   */
  create(input: {
    amount: number;
    customer?: { mobile?: string | null; name?: string | null };
    description: string;
    embedded?: boolean;
    reference: string;
    returnUrl?: string;
  }): Promise<ProviderLink>;
  read(providerRef: string): Promise<ProviderState>;
  /** The key a browser opens the provider's checkout with (Razorpay's key id); never a secret. */
  publicKey?: string;
}

export const providerLabels: Record<OnlinePaymentProvider, string> = {
  PAYU: 'PayU',
  PINELABS: 'Pine Labs',
  RAZORPAY: 'Razorpay',
};

type Json = Record<string, unknown>;

/** A provider's id or message as text; anything else reads as empty. */
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/**
 * A new link's url and id; a reply missing either is refused rather than saved as "undefined".
 * The guest's phone is sent to the url (and the QR holds it), so only an https page will do.
 */
function link(provider: OnlinePaymentProvider, paymentUrl: unknown, providerRef: unknown) {
  if (!/^https:\/\/[^/]/i.test(text(paymentUrl)) || !text(providerRef)) {
    throw new BadGatewayException(
      `${providerLabels[provider]} did not send a payment link. Try again, or take the payment another way.`,
    );
  }

  return { paymentUrl: text(paymentUrl), providerRef: text(providerRef) };
}

// PayU statuses that end a link; anything else (or no status) keeps it open for the next check.
const payuClosedStatuses = new Set(['cancelled', 'deactivated', 'expired', 'inactive']);

/** One provider call: a timeout, and its own error message passed on to the cashier. */
async function call(provider: OnlinePaymentProvider, url: string, init: RequestInit = {}) {
  const label = providerLabels[provider];
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }).catch(
    () => null,
  );

  if (!response) {
    throw new ServiceUnavailableException(
      `${label} did not answer. Try again, or take the payment another way.`,
    );
  }

  const body = (await response.json().catch(() => null)) as Json | null;

  // PayU answers 200 with status -1 for a refusal; Razorpay uses the HTTP status.
  const status = body?.status;

  if (!response.ok || (typeof status === 'number' && status < 0)) {
    const error = body?.error as Json | undefined;
    const reason = error?.description ?? body?.message ?? `HTTP ${response.status}`;
    throw new BadGatewayException(`${label} refused it: ${text(reason)}`);
  }

  return body ?? {};
}

/**
 * Razorpay: Payment Links (the till's QR, the kiosk), or an Order paid in Razorpay's checkout on
 * the guest's own phone page (QR orders: the link page asks for the mobile again, the checkout
 * takes it prefilled). Amounts in paise, Basic auth with the key id and secret.
 */
function razorpay(keyId: string, keySecret: string): PaymentProvider {
  const base = 'https://api.razorpay.com/v1/payment_links';
  const api = 'https://api.razorpay.com/v1';
  const headers = {
    authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    'content-type': 'application/json',
  };
  const isOrder = (providerRef: string) => providerRef.startsWith('order_');

  /**
   * Paid once Razorpay holds a captured payment for the order: asked here with the secret, so a
   * browser saying "paid" proves nothing. An authorised one (an account capturing by hand) is
   * captured now; Razorpay would refund it otherwise.
   */
  async function readOrder(orderId: string): Promise<ProviderState> {
    const body = await call('RAZORPAY', `${api}/orders/${orderId}/payments`, { headers });
    const items = (body.items ?? []) as Json[];
    let captured: Json | undefined = items.find((payment) => payment.status === 'captured');
    const authorized = captured ? undefined : items.find((item) => item.status === 'authorized');

    if (authorized) {
      captured = await call('RAZORPAY', `${api}/payments/${text(authorized.id)}/capture`, {
        body: JSON.stringify({ amount: authorized.amount, currency: 'INR' }),
        headers,
        method: 'POST',
      });
    }

    return { closed: false, paid: Boolean(captured), reference: text(captured?.id) || null };
  }

  return {
    async cancel(providerRef) {
      // ponytail: Razorpay has no cancel for an order, so a checkout still open can be paid after
      // this. AAHAR asks first (cancel checks before it lets go), and the QR sweep asks again for
      // 30 minutes (QrOrdersService.sweep); a payment later than that is not seen.
      if (isOrder(providerRef)) return;
      await call('RAZORPAY', `${base}/${providerRef}/cancel`, { headers, method: 'POST' });
    },
    async create({ amount, customer, description, embedded, reference, returnUrl }) {
      if (embedded) {
        const order = await call('RAZORPAY', `${api}/orders`, {
          body: JSON.stringify({
            amount: Math.round(amount * 100),
            currency: 'INR',
            notes: { description },
            receipt: reference,
          }),
          headers,
          method: 'POST',
        });

        if (!text(order.id)) {
          throw new BadGatewayException(
            'Razorpay did not open the payment. Try again, or take the payment another way.',
          );
        }

        return { paymentUrl: '', providerRef: text(order.id) };
      }

      const payer = {
        ...(customer?.mobile ? { contact: `+91${customer.mobile}` } : {}),
        ...(customer?.name ? { name: customer.name } : {}),
      };
      const body = await call('RAZORPAY', base, {
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency: 'INR',
          // The guest pays from the till's QR or their own phone: Razorpay messages no one.
          ...(Object.keys(payer).length
            ? { customer: payer, notify: { email: false, sms: false } }
            : {}),
          description,
          reference_id: reference,
          ...(returnUrl ? { callback_method: 'get', callback_url: returnUrl } : {}),
        }),
        headers,
        method: 'POST',
      });

      return link('RAZORPAY', body.short_url, body.id);
    },
    publicKey: keyId,
    async read(providerRef) {
      if (isOrder(providerRef)) return readOrder(providerRef);
      const body = await call('RAZORPAY', `${base}/${providerRef}`, { headers });
      const payments = (body.payments ?? []) as Json[];

      return {
        closed: body.status === 'cancelled' || body.status === 'expired',
        paid: body.status === 'paid',
        reference: text(payments[0]?.payment_id) || null,
      };
    },
  };
}

/** PayU Payment Links: OAuth client credentials (a token lasts ~2 h), amounts in rupees. */
function payu(settings: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  tokenUrl: string;
}): PaymentProvider {
  let token: { expiresAt: number; value: string } | null = null;
  const headers = async () => {
    if (!token || token.expiresAt < Date.now() + 60_000) {
      // Form-encoded, as OAuth asks: PayU's production sign-in refuses a JSON body.
      const body = await call('PAYU', settings.tokenUrl, {
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          grant_type: 'client_credentials',
          scope: 'create_payment_links read_payment_links',
        }).toString(),
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      });
      token = {
        expiresAt: Date.now() + Number(body.expires_in ?? 0) * 1000,
        value: String(body.access_token),
      };
    }

    return {
      authorization: `Bearer ${token.value}`,
      'content-type': 'application/json',
      merchantId: settings.merchantId,
    };
  };

  return {
    // ponytail: the PayU link API given to us has no cancel; a link takes one payment, and the
    // till checks it once more before letting it go. Add PayU's deactivate call if they send it.
    async cancel() {},
    async create({ amount, description }) {
      const body = await call('PAYU', `${settings.baseUrl}/payment-links/`, {
        body: JSON.stringify({
          description,
          isPartialPaymentAllowed: false,
          source: 'API',
          subAmount: amount,
        }),
        headers: await headers(),
        method: 'POST',
      });

      const result = (body.result ?? {}) as Json;

      return link('PAYU', result.paymentLink, result.invoiceNumber);
    },
    async read(providerRef) {
      const body = await call('PAYU', `${settings.baseUrl}/payment-links/${providerRef}`, {
        headers: await headers(),
      });
      const result = (body.result ?? {}) as Json;
      const paid = Number(result.dueAmount) === 0 && Number(result.totalAmountCollected) > 0;

      return {
        closed: !paid && payuClosedStatuses.has(text(result.status).toLowerCase()),
        paid,
        reference: paid ? text(result.transactionId) || providerRef : null,
      };
    },
  };
}

/** A counter's Pine Labs card machine, as set up under POS & Payment Machines. */
/**
 * PayU with the merchant key and salt: a payment link is a PayU invoice (create_invoice), read with
 * verify_payment and closed with expire_invoice. Each call is signed, sha512(key|command|var1|salt),
 * with no sign-in step to fail. PayU needs an email on every link (the till rarely has the guest's),
 * so it gets F&B's own; PayU's emails and texts about the link are off.
 */
function payuInvoices(settings: {
  email: string;
  key: string;
  salt: string;
  url: string;
}): PaymentProvider {
  const post = (command: string, var1: string) =>
    call('PAYU', settings.url, {
      body: new URLSearchParams({
        command,
        hash: createHash('sha512')
          .update([settings.key, command, var1, settings.salt].join('|'))
          .digest('hex'),
        key: settings.key,
        var1,
      }).toString(),
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });

  return {
    async cancel(providerRef) {
      await post('expire_invoice', providerRef);
    },
    async create({ amount, customer, description, reference }) {
      // PayU's order number: short and plain, from the payment's own id.
      const txnid = `fnb${reference.replace(/[^a-zA-Z0-9]/g, '').slice(0, 22)}`;
      const reply: unknown = await post(
        'create_invoice',
        JSON.stringify({
          amount: amount.toFixed(2),
          email: settings.email,
          firstname: customer?.name?.trim() || 'Guest',
          ...(customer?.mobile ? { phone: customer.mobile } : {}),
          productinfo: description,
          send_email_now: '0',
          send_sms: '0',
          txnid,
          validation_period: 1,
        }),
      );

      // A refusal comes back as a bare message ("Invalid email.").
      if (typeof reply === 'string') {
        throw new BadGatewayException(`PayU refused it: ${reply}`);
      }

      return link('PAYU', (reply as Json).URL, txnid);
    },
    async read(providerRef) {
      const body = await post('verify_payment', providerRef);
      const details = (body.transaction_details as Json | undefined)?.[providerRef] as
        Json | undefined;
      const paid = text(details?.status).toLowerCase() === 'success';

      // An unpaid invoice stays open: a failed try can be paid again, and the till cancels it.
      return {
        closed: false,
        paid,
        reference: paid ? text(details?.mihpayid) || providerRef : null,
      };
    },
  };
}

export interface PinelabsMachine {
  imei: string;
  merchantId: string;
  merchantStorePosCode: string;
  securityToken: string;
}

// Plutus statuses that end a payment unpaid. Anything else not approved (a plain "ERROR", say)
// keeps it waiting on the machine, so a hiccup never closes a payment the guest may be making.
const plutusClosed = /CANCEL|DECLIN|EXPIR|FAIL|REJECT|VOID/i;

/**
 * Pine Labs Plutus Cloud: the bill's amount is sent to the counter's card machine, where the guest
 * pays by card; the till then reads its status. Amounts are in paise. Plutus answers HTTP 200 even
 * when it refuses, with ResponseCode 0 for success.
 */
export function pinelabs(baseUrl: string, machine: PinelabsMachine): PaymentProvider {
  const credentials = {
    IMEI: machine.imei,
    MerchantID: machine.merchantId,
    MerchantStorePosCode: machine.merchantStorePosCode,
    SecurityToken: machine.securityToken,
  };
  const post = (path: string, body: Json) =>
    call('PINELABS', `${baseUrl}/${path}`, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
  const status = async (providerRef: string) => {
    const body = await post('GetCloudBasedTxnStatus', {
      ...credentials,
      PlutusTransactionReferenceID: Number(providerRef),
    });
    const message = text(body.ResponseMessage).trim();
    // The whole message: "NOT APPROVED" contains the word too.
    const paid = body.ResponseCode === 0 && /^(TXN )?APPROVED$/i.test(message);
    const data = Array.isArray(body.TransactionData) ? (body.TransactionData as Json[]) : [];
    const tag = (name: string) => text(data.find((entry) => entry.Tag === name)?.Value);

    return {
      closed: !paid && plutusClosed.test(message),
      paid,
      reference: paid ? tag('RRN') || tag('ApprovalCode') || providerRef : null,
    };
  };

  return {
    async cancel(providerRef, amount) {
      const body = await post('CancelTransaction', {
        ...credentials,
        Amount: Math.round(amount * 100),
        PlutusTransactionReferenceID: Number(providerRef),
        TakeToHomeScreen: true,
      });

      // Refused: paid already means the cancel failed; anything else is gone from the machine.
      if (body.ResponseCode !== 0 && (await status(providerRef)).paid) {
        throw new BadGatewayException('Pine Labs refused the cancel: the guest has paid.');
      }
    },
    async create({ amount, reference }) {
      const body = await post('UploadBilledTransaction', {
        ...credentials,
        AllowedPaymentMode: '1',
        Amount: Math.round(amount * 100),
        AutoCancelDurationInMinutes: 5,
        SequenceNumber: 1,
        // Our payment's id, short: Plutus refuses long bill numbers.
        TransactionNumber: reference.replaceAll('-', '').slice(0, 20),
        UserID: '',
      });

      const providerRef = Number(body.PlutusTransactionReferenceID);

      if (body.ResponseCode !== 0 || !(providerRef > 0)) {
        throw new BadGatewayException(`Pine Labs refused it: ${text(body.ResponseMessage)}`);
      }

      // No page to open: the amount is waiting on the machine.
      return { paymentUrl: '', providerRef: String(providerRef) };
    },
    read: status,
  };
}

/** Pine Labs' Plutus Cloud API; unset (''), card machines are not offered. */
export function plutusBaseUrl(config: ConfigService) {
  return config.get<string>('PINELABS_BASE_URL')?.trim().replace(/\/+$/, '') ?? '';
}

/**
 * A card machine with all four Pine Labs details, the default first: by its id, or the one on
 * the counter's POS device. None while Plutus is not set up here.
 */
export async function findCardMachine(
  prisma: Pick<Prisma.TransactionClient, 'counter' | 'paymentMachine'>,
  plutusUrl: string,
  by: { counterId: string } | { id: string },
) {
  if (!plutusUrl) {
    return null;
  }

  let where: { id: string } | { posDeviceId: string };

  if ('id' in by) {
    where = { id: by.id };
  } else {
    const counter = await prisma.counter.findFirst({
      select: { posDeviceId: true },
      where: { deletedAt: null, id: by.counterId },
    });

    if (!counter?.posDeviceId) {
      return null;
    }

    where = { posDeviceId: counter.posDeviceId };
  }

  const machines = await prisma.paymentMachine.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    where: { ...where, deletedAt: null, isActive: true },
  });

  for (const machine of machines) {
    const details: PinelabsMachine = {
      imei: machine.pinelabImei?.trim() ?? '',
      merchantId: machine.pinelabMerchantId?.trim() ?? '',
      merchantStorePosCode: machine.pinelabMerchantStorePosCode?.trim() ?? '',
      securityToken: openField(machine.pinelabSecurityToken)?.trim() ?? '',
    };

    if (Object.values(details).every(Boolean)) {
      return { ...details, id: machine.id, name: machine.name };
    }
  }

  return null;
}

/** A location's gateway choice and its own keys (each null until set on the location). */
export interface LocationPaymentKeys {
  onlinePaymentOption: 'NONE' | 'PAYU' | 'RAZORPAY';
  payuClientId: string | null;
  payuClientSecret: string | null;
  payuMerchantId: string | null;
  razorpayKeyId: string | null;
  razorpayKeySecret: string | null;
}

// One provider per set of keys, so a PayU token is reused across bills like the shared one.
const byKeys = new Map<string, PaymentProvider>();

/**
 * The UPI gateway a location's tills offer: only the one its Online Payment Option picks, on the
 * location's own account when every key of it is set, else on the shared server keys. None
 * offers none.
 */
export function locationProviders(config: ConfigService, location: LocationPaymentKeys) {
  const value = (key: string) => config.get<string>(key)?.trim() || '';
  const own = (...keys: Array<string | null>) => keys.map((key) => key?.trim() ?? '');
  const providers = new Map<OnlinePaymentProvider, PaymentProvider>();
  const shared = paymentProviders(config);
  const once = (cacheKey: string, build: () => PaymentProvider) => {
    if (!byKeys.has(cacheKey)) byKeys.set(cacheKey, build());
    return byKeys.get(cacheKey)!;
  };

  if (location.onlinePaymentOption === 'RAZORPAY') {
    const [keyId, keySecret] = own(location.razorpayKeyId, openField(location.razorpayKeySecret));
    const provider =
      keyId && keySecret
        ? once(`RAZORPAY:${keyId}:${keySecret}`, () => razorpay(keyId, keySecret))
        : shared.get('RAZORPAY');
    if (provider) providers.set('RAZORPAY', provider);
  }

  if (location.onlinePaymentOption === 'PAYU') {
    const [clientId, clientSecret, merchantId] = own(
      location.payuClientId,
      openField(location.payuClientSecret),
      location.payuMerchantId,
    );
    const endpoints = { baseUrl: value('PAYU_BASE_URL'), tokenUrl: value('PAYU_TOKEN_URL') };
    const provider =
      clientId && clientSecret && merchantId && endpoints.baseUrl && endpoints.tokenUrl
        ? once(`PAYU:${clientId}:${clientSecret}:${merchantId}`, () =>
            payu({ ...endpoints, clientId, clientSecret, merchantId }),
          )
        : shared.get('PAYU');
    if (provider) providers.set('PAYU', provider);
  }

  return providers;
}

/** The UPI gateways a location's tills offer, read from the location (none for an unknown one). */
export async function providersAt(
  client: Pick<Prisma.TransactionClient, 'hospital'>,
  config: ConfigService,
  hospitalId: string,
) {
  const location = await client.hospital.findFirst({
    select: {
      onlinePaymentOption: true,
      payuClientId: true,
      payuClientSecret: true,
      payuMerchantId: true,
      razorpayKeyId: true,
      razorpayKeySecret: true,
    },
    where: { id: hospitalId },
  });

  return location ? locationProviders(config, location) : new Map<never, never>();
}

/** The providers whose keys are all set on the server: the shared accounts. */
export function paymentProviders(config: ConfigService) {
  const value = (key: string) => config.get<string>(key)?.trim() || '';
  const providers = new Map<OnlinePaymentProvider, PaymentProvider>();

  if (value('RAZORPAY_KEY_ID') && value('RAZORPAY_KEY_SECRET')) {
    providers.set('RAZORPAY', razorpay(value('RAZORPAY_KEY_ID'), value('RAZORPAY_KEY_SECRET')));
  }

  const payuSettings = {
    baseUrl: value('PAYU_BASE_URL'),
    clientId: value('PAYU_CLIENT_ID'),
    clientSecret: value('PAYU_CLIENT_SECRET'),
    merchantId: value('PAYU_MERCHANT_ID'),
    tokenUrl: value('PAYU_TOKEN_URL'),
  };

  // The merchant key and salt first: they sign each call, with no OAuth sign-in to fail.
  const payuKeyAndSalt = {
    email: value('PAYU_INVOICE_EMAIL'),
    key: value('PAYU_KEY'),
    salt: value('PAYU_SALT'),
    url: value('PAYU_POSTSERVICE_URL'),
  };

  if (Object.values(payuKeyAndSalt).every(Boolean)) {
    providers.set('PAYU', payuInvoices(payuKeyAndSalt));
  } else if (Object.values(payuSettings).every(Boolean)) {
    providers.set('PAYU', payu(payuSettings));
  }

  return providers;
}
