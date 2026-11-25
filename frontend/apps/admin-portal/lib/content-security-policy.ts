// The portal's Content-Security-Policy, set per page request by proxy.ts with a fresh nonce.
// Tokens live in localStorage, so this is the main line against an injected script: only this
// origin's script files and Next's own inline scripts (which carry the nonce) run, and nothing
// can be sent to, or loaded from, another site (connect-src, img-src and the rest are 'self').

// Where the browser may send requests: this origin plus whichever API origins lib/api.ts reads
// (unset in the cluster, where the API is same-origin; localhost ports in local dev). Inlined at
// build time like the rest of NEXT_PUBLIC_*.
const apiOrigins = [
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NEXT_PUBLIC_AUTH_API_URL,
  process.env.NEXT_PUBLIC_ORGANIZATION_API_URL,
  process.env.NEXT_PUBLIC_USER_API_URL,
].flatMap((url) => (url && /^https?:\/\//.test(url) ? [new URL(url).origin] : []));

// The guest's QR order page alone opens Razorpay's checkout: its script, the payment window it
// frames, and the calls that script makes.
const razorpay = 'https://checkout.razorpay.com https://api.razorpay.com';

export function contentSecurityPolicy(nonce: string, isOrderPage: boolean): string {
  return [
    "default-src 'self'",
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      // React rebuilds server error stacks with eval in development only.
      ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
      ...(isOrderPage ? ['https://checkout.razorpay.com'] : []),
    ].join(' '),
    // The print frame (lib/print.ts) and component styles are inline. No nonce here: one would
    // make browsers ignore 'unsafe-inline' for styles.
    "style-src 'self' 'unsafe-inline'",
    // blob: previews a chosen restaurant image before upload.
    `img-src 'self' data: blob:${isOrderPage ? ' https://cdn.razorpay.com' : ''}`,
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      ...new Set(apiOrigins),
      ...(isOrderPage ? [razorpay, 'https://lumberjack.razorpay.com'] : []),
    ].join(' '),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isOrderPage ? [`frame-src ${razorpay}`] : []),
  ].join('; ');
}
