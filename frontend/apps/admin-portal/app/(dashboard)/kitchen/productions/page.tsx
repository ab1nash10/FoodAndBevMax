import { Suspense } from 'react';
import { KitchenProductionsPageClient } from '@/components/kitchen/productions/productions-page';

export default function KitchenProductionsPage() {
  // ?id= opens a production, which needs a Suspense boundary.
  return (
    <Suspense>
      <KitchenProductionsPageClient />
    </Suspense>
  );
}
