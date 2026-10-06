import { Suspense } from 'react';
import { GrnsPageClient } from '@/components/inventory/grns/grns-page';

export default function GrnsPage() {
  // ?id= opens a GRN for verification, which needs a Suspense boundary.
  return (
    <Suspense>
      <GrnsPageClient />
    </Suspense>
  );
}
