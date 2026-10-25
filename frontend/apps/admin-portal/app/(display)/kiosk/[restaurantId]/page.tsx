import type { Metadata, Viewport } from 'next';
import { Kiosk } from '@/components/kiosk/kiosk';

// A kiosk's secret link: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Order here',
};

// A touch screen in a public place: a stray pinch must not zoom the menu out of shape.
export const viewport: Viewport = {
  maximumScale: 1,
  userScalable: false,
};

interface KioskPageProps {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /kiosk/<restaurantId>?token=<board secret> on the self-service touch screen: guests pick their
 * food, get an order number and pay at the counter. The same secret as the restaurant's TV board.
 */
export default async function KioskPage({ params, searchParams }: KioskPageProps) {
  const { restaurantId } = await params;
  const query = await searchParams;

  return <Kiosk restaurantId={restaurantId} token={first(query.token)} />;
}
