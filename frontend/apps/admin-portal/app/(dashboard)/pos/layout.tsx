import type { ReactNode } from 'react';
import { PosGate } from '@/components/point-of-sale/pos-gate';

export default function PosLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PosGate>{children}</PosGate>;
}
