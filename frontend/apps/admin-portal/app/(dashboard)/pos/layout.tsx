import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PosGate } from '@/components/point-of-sale/pos-gate';
import { withBasePath } from '@/lib/base-path';

// Only the POS screens link the app manifest, so only they offer "Install AAHAR POS".
export const metadata: Metadata = {
  manifest: withBasePath('/pos-app.webmanifest'),
};

export default function PosLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PosGate>{children}</PosGate>;
}
