import { Suspense } from 'react';
import { TransfersPageClient } from '@/components/inventory/transfers/transfers-page';

export default function TransfersPage() {
  // The list reads the open transfer from ?id=, which needs a Suspense boundary.
  return (
    <Suspense>
      <TransfersPageClient />
    </Suspense>
  );
}
