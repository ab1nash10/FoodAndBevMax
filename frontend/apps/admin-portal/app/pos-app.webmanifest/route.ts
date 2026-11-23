import { withBasePath } from '@/lib/base-path';

/**
 * The installable POS app. Linked only from the POS screens (app/(dashboard)/pos/layout.tsx),
 * so only a signed-in user on the POS is offered "Install". The app opens on sign-in, which
 * then sends it to Billing (homeHref's posApp). The scope is the whole portal because sign-in
 * and the POS are siblings - a narrower one would show the browser bar on the sign-in page.
 */
export function GET() {
  return Response.json(
    {
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        { sizes: '192x192', src: withBasePath('/brand/pos-app-192.png'), type: 'image/png' },
        { sizes: '512x512', src: withBasePath('/brand/pos-app-512.png'), type: 'image/png' },
        {
          purpose: 'maskable',
          sizes: '512x512',
          src: withBasePath('/brand/pos-app-512.png'),
          type: 'image/png',
        },
      ],
      id: withBasePath('/pos-app'),
      name: 'F&B POS',
      scope: withBasePath('/'),
      short_name: 'F&B POS',
      start_url: withBasePath('/auth/login'),
      theme_color: '#0b5cad',
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
