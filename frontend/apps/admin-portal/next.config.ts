import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

import { BASE_PATH } from './lib/base-path';

// Where the browser may send requests: this origin plus whichever API origins lib/api.ts
// reads (unset in the cluster, where the API is same-origin; localhost ports in local dev).
const apiOrigins = [
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NEXT_PUBLIC_AUTH_API_URL,
  process.env.NEXT_PUBLIC_ORGANIZATION_API_URL,
  process.env.NEXT_PUBLIC_USER_API_URL,
].flatMap((url) => (url && /^https?:\/\//.test(url) ? [new URL(url).origin] : []));
const localDevOrigins = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((address) => address.family === 'IPv4' && !address.internal)
  .map((address) => address.address);

// Tokens live in localStorage, so this limits what an injected script could do with them: it
// can send nothing to, or load anything from, another site (connect-src, img-src and the
// rest are 'self'). ponytail: scripts still allow 'unsafe-inline' - Next's inline bootstrap
// needs it unless every page is rendered per request with a nonce.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  // The print frame (lib/print.ts) and component styles are inline.
  "style-src 'self' 'unsafe-inline'",
  // blob: previews a chosen restaurant image before upload.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  ["connect-src 'self'", ...new Set(apiOrigins)].join(' '),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // The prefix is baked into the bundle here, so it must be the same value the client
  // helper uses - both read it from lib/base-path.
  basePath: BASE_PATH,
  allowedDevOrigins: process.env.NODE_ENV === 'development' ? localDevOrigins : [],
  devIndicators: false,
  // Tokens live in localStorage, so these are the portal's main line against injected scripts,
  // clickjacking and content sniffing (uploads are served from /uploads).
  headers() {
    return Promise.resolve([
      {
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Same as the API sends. Browsers ignore it over HTTP or on a certificate error, so
          // it takes hold once the site is served on its own domain with a valid certificate.
          { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
        source: '/:path*',
      },
    ]);
  },
  rewrites() {
    if (process.env.NODE_ENV !== 'development') {
      return Promise.resolve([]);
    }

    const organizationApiBase = (
      process.env.NEXT_PUBLIC_ORGANIZATION_API_URL || 'http://localhost:4003/api/v1'
    ).replace(/\/+$/, '');

    return Promise.resolve([
      {
        basePath: false,
        destination: `${organizationApiBase}/kiosk/:path*`,
        source: `${BASE_PATH}/api/v1/kiosk/:path*`,
      },
      {
        basePath: false,
        destination: `${organizationApiBase}/order-board/:path*`,
        source: `${BASE_PATH}/api/v1/order-board/:path*`,
      },
    ]);
  },
  // Images are served as the files in public/, already sized for the screen. Next 16.3's
  // optimizer hangs every later request for an image whose first optimization was cancelled
  // mid-way (a sign-in redirect does that to the logo), until the server restarts.
  images: { unoptimized: true },
  output: 'standalone',
  poweredByHeader: false,
  // The bare origin has no page under the prefix, so send it in. Only reachable locally: the
  // ingress routes nothing outside the prefix to the portal.
  redirects() {
    return Promise.resolve(
      BASE_PATH
        ? [
            {
              basePath: false,
              destination: `${BASE_PATH}/dashboard`,
              permanent: false,
              source: '/',
            },
          ]
        : [],
    );
  },
  reactStrictMode: true,
  transpilePackages: ['@aahar/api-client', '@aahar/types', '@aahar/ui'],
};

export default nextConfig;
