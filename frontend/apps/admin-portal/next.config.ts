import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

import { BASE_PATH } from './lib/base-path';

// A phone opening the QR page reaches the dev server by this PC's address. Read once at start,
// that list missed a network joined later (a phone hotspot, 2026-11-16), and the page reloaded
// forever as its live-reload connection was refused: private ranges cover any such network.
const localDevOrigins = [
  ...Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address),
  '10.*.*.*',
  '172.*.*.*',
  '192.168.*.*',
];

const nextConfig: NextConfig = {
  // The prefix is baked into the bundle here, so it must be the same value the client
  // helper uses - both read it from lib/base-path.
  basePath: BASE_PATH,
  allowedDevOrigins: process.env.NODE_ENV === 'development' ? localDevOrigins : [],
  devIndicators: false,
  // Clickjacking and content sniffing (uploads are served from /uploads). The script policy
  // (Content-Security-Policy) is set per page request, with its nonce, by proxy.ts.
  headers() {
    return Promise.resolve([
      {
        headers: [
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
      // Live changes (lib/live-changes.ts): every screen, guests' phones included, on one URL.
      {
        basePath: false,
        destination: `${organizationApiBase}/changes`,
        source: `${BASE_PATH}/api/v1/changes`,
      },
      // The QR order page on a guest's phone: without it the page found no menu in development.
      {
        basePath: false,
        destination: `${organizationApiBase}/qr/:path*`,
        source: `${BASE_PATH}/api/v1/qr/:path*`,
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
