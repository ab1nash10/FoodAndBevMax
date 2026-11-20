import { Suspense } from 'react';
import { ErpGrnsPageClient } from '@/components/inventory/erp-grns/erp-grns-page';

/** Inventory's ERP GRNs, as the Logs section's ERP transaction log. */
export default function ErpGrnLogPage() {
  // The list and ?grn= live in the address, which needs a Suspense boundary.
  return (
    <Suspense>
      <ErpGrnsPageClient log />
    </Suspense>
  );
}
