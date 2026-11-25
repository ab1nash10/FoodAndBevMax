import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';
import { withBasePath } from '@/lib/base-path';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'F&B | Food & Beverage',
    template: '%s | F&B',
  },
  description: 'F&B: food and beverage management for Max Healthcare.',
  icons: {
    icon: withBasePath('/brand/max-favicon.ico'),
  },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Rendered per request, never at build time: the nonce proxy.ts sets is put on Next's inline
  // scripts as the page renders, and a prebuilt page would carry none and be blocked.
  await connection();

  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
