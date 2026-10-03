import { Suspense } from 'react';
import { ItemsPageClient } from '@/components/master-data/master-data-pages';

export default function ItemsPage() {
  // The list reads the open item from ?id=, which needs a Suspense boundary.
  return (
    <Suspense>
      <ItemsPageClient />
    </Suspense>
  );
}
