import type { Metadata, Viewport } from 'next';
import { QrOrder } from '@/components/qr-order/qr-order';

// The restaurant's secret link on a guest's phone: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Order food',
};

export const viewport: Viewport = { viewportFit: 'cover' };

interface OrderPageProps {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /order/<restaurantId>?token=<board secret>: ordering from the restaurant's QR, on the guest's
 * own phone, for their room or for pickup at the counter. The payment page sends the guest back with &order=<id>&key=<key>.
 */
export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const { restaurantId } = await params;
  const query = await searchParams;

  return (
    <QrOrder
      orderId={first(query.order)}
      orderKey={first(query.key)}
      restaurantId={restaurantId}
      token={first(query.token)}
    />
  );
}
