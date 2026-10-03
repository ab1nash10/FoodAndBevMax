import { Suspense } from 'react';
import { GrnsPageClient } from '@/components/inventory/inventory-pages';

export default function GrnsPage() {
  // ?id= opens a GRN for verification, which needs a Suspense boundary.
  return (
    <Suspense>
      <GrnsPageClient />
    </Suspense>
  );
}
