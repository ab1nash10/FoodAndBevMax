import { Suspense } from 'react';
import { ReturnToStorePageClient } from '@/components/inventory/returns/return-to-store-page';

export default function ReturnToStorePage() {
  // The restaurant comes from ?restaurant= (the POS and Restaurant Stock links), which needs a
  // Suspense boundary.
  return (
    <Suspense>
      <ReturnToStorePageClient />
    </Suspense>
  );
}
