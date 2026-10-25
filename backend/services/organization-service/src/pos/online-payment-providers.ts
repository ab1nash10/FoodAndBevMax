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
  cancel(providerRef: string): Promise<void>;
  create(input: { amount: number; description: string; reference: string }): Promise<ProviderLink>;
  read(providerRef: string): Promise<ProviderState>;
}

export const providerLabels: Record<OnlinePaymentProvider, string> = {
  PAYU: 'PayU',
  RAZORPAY: 'Razorpay',
};

type Json = Record<string, unknown>;

/** A provider's id or message as text; anything else reads as empty. */
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

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

      return { paymentUrl: String(body.short_url), providerRef: String(body.id) };
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

      return {
        paymentUrl: String(result.paymentLink),
        providerRef: String(result.invoiceNumber),
      };
    },
    async read(providerRef) {
      const body = await call('PAYU', `${settings.baseUrl}/payment-links/${providerRef}`, {
        headers: await headers(),
      });
      const result = (body.result ?? {}) as Json;
      const paid = Number(result.dueAmount) === 0 && Number(result.totalAmountCollected) > 0;

      return {
        closed: !paid && result.status !== 'active',
        paid,
        reference: paid ? text(result.transactionId) || providerRef : null,
      };
    },
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
