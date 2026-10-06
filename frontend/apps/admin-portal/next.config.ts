import type { NextConfig } from 'next';

import { BASE_PATH } from './lib/base-path';

const nextConfig: NextConfig = {
  // The prefix is baked into the bundle here, so it must be the same value the client
  // helper uses - both read it from lib/base-path.
  basePath: BASE_PATH,
  devIndicators: false,
  // Tokens live in localStorage, so these are the portal's main line against clickjacking and
  // content sniffing (uploads are served from /uploads). ponytail: no script CSP yet - Next's
  // inline bootstrap and the per-environment API origins need nonces and a browser pass first.
  headers() {
    return Promise.resolve([
      {
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
        source: '/:path*',
      },
    ]);
  },
  // Images are served as the files in public/, already sized for the screen. Next 16.3's
  // optimizer hangs every later request for an image whose first optimization was cancelled
  // mid-way (a sign-in redirect does that to the logo), until the server restarts.
  images: { unoptimized: true },
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@aahar/api-client', '@aahar/types', '@aahar/ui'],
};

export default nextConfig;
