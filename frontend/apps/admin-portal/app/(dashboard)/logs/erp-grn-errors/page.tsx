import { Suspense } from 'react';
import { ErpGrnErrorsPage } from '@/components/inventory/erp-grns/erp-grn-errors-page';

/** GRNs the ERP sent that AAHAR refused, under Logs. */
export default function ErpGrnErrorsRoute() {
  // The search and dates live in the address, which needs a Suspense boundary.
  return (
    <Suspense>
      <ErpGrnErrorsPage />
    </Suspense>
  );
}
