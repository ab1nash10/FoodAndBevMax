import type { Metadata, Viewport } from 'next';
import { TableQr } from '@/components/qr-order/table-qr';

// A table's QR on a guest's phone: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Order food',
};

export const viewport: Viewport = { viewportFit: 'cover' };

/** /order/table/<tableId>: a dine-in table's QR. Opens its restaurant's menu with the table filled in. */
export default async function TableOrderPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;

  return <TableQr tableId={tableId} />;
}
