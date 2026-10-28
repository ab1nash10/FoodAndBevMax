import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { OnlinePaymentProvider } from '@prisma/client';

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
  create(input: { amount: number; description: string; reference: string }): Promise<ProviderLink>;
  read(providerRef: string): Promise<ProviderState>;
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

/** A new link's url and id; a reply missing either is refused rather than saved as "undefined". */
function link(provider: OnlinePaymentProvider, paymentUrl: unknown, providerRef: unknown) {
  if (!text(paymentUrl) || !text(providerRef)) {
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

/** Razorpay Payment Links: amounts in paise, Basic auth with the key id and secret. */
function razorpay(keyId: string, keySecret: string): PaymentProvider {
  const base = 'https://api.razorpay.com/v1/payment_links';
  const headers = {
    authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    'content-type': 'application/json',
  };

  return {
    async cancel(providerRef) {
      await call('RAZORPAY', `${base}/${providerRef}/cancel`, { headers, method: 'POST' });
    },
    async create({ amount, description, reference }) {
      const body = await call('RAZORPAY', base, {
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency: 'INR',
          description,
          reference_id: reference,
        }),
        headers,
        method: 'POST',
      });

      return link('RAZORPAY', body.short_url, body.id);
    },
    async read(providerRef) {
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
      const body = await call('PAYU', settings.tokenUrl, {
        body: JSON.stringify({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          grant_type: 'client_credentials',
          scope: 'create_payment_links read_payment_links',
        }),
        headers: { accept: 'application/json', 'content-type': 'application/json' },
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
    const message = text(body.ResponseMessage);
    const paid = body.ResponseCode === 0 && /APPROVED/i.test(message);
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

/** The providers whose keys are all set; the cashier is offered only these. */
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

  if (Object.values(payuSettings).every(Boolean)) {
    providers.set('PAYU', payu(payuSettings));
  }

  return providers;
}
