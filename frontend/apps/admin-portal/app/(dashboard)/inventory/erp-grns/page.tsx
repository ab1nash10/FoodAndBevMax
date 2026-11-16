import { Suspense } from 'react';
import { ErpGrnsPageClient } from '@/components/inventory/erp-grns/erp-grns-page';

export default function ErpGrnsPage() {
  // The list and ?grn= live in the address, which needs a Suspense boundary.
  return (
    <Suspense>
      <ErpGrnsPageClient />
    </Suspense>
  );
}
