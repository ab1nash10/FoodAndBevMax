import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { withBasePath } from '@/lib/base-path';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'AAHAR | Food & Cafeteria Management Platform',
    template: '%s | AAHAR',
  },
  description: 'AAHAR Food & Cafeteria Management Platform for Max Healthcare.',
  icons: {
    icon: withBasePath('/brand/max-favicon.ico'),
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
