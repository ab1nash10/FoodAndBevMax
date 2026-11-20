import type { QrCheckout } from '@aahar/api-client';

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open(): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: ReturnType<typeof checkoutOptions>) => RazorpayInstance;
  }
}

/**
 * What Razorpay's checkout opens with: the server's order, on UPI, the signed-in guest's name and
 * mobile filled in and locked (Razorpay's link page asked for the mobile again; this does not).
 */
export function checkoutOptions(
  checkout: QrCheckout,
  handlers: { onDismiss?: () => void; onPaid: () => void },
) {
  return {
    amount: checkout.amount,
    currency: checkout.currency,
    handler: () => handlers.onPaid(),
    key: checkout.keyId,
    modal: { ondismiss: () => handlers.onDismiss?.() },
    name: checkout.name,
    order_id: checkout.orderId,
    prefill: { ...checkout.prefill, method: 'upi' },
    readonly: { contact: Boolean(checkout.prefill.contact), name: Boolean(checkout.prefill.name) },
    theme: { color: '#1d4ed8' },
  };
}

let loading: Promise<void> | null = null;

/** Razorpay's script, fetched once; started early so the Pay button opens it at once. */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();

  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('The payment window could not load. Check your connection and try again.'));
    };
    document.head.append(script);
  });

  return loading;
}

/** Opens Razorpay's checkout over the page for the order. */
export async function openRazorpayCheckout(
  checkout: QrCheckout,
  handlers: { onDismiss?: () => void; onPaid: () => void },
) {
  await loadRazorpay();
  new window.Razorpay!(checkoutOptions(checkout, handlers)).open();
}
