import type { Metadata } from 'next';
import { OrderBoard } from '@/components/order-board/order-board';

// A TV's secret link: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Order status',
};

interface OrderBoardPageProps {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /board/<restaurantId>?token=<board secret> on the TV above the collection counter.
 * ?demo=1 runs a simulated feed, ?theme=dark the dark palette, ?sound=1 a chime when an order
 * is ready.
 */
export default async function OrderBoardPage({ params, searchParams }: OrderBoardPageProps) {
  const { restaurantId } = await params;
  const query = await searchParams;

  return (
    <OrderBoard
      demo={first(query.demo) === '1'}
      restaurantId={restaurantId}
      sound={first(query.sound) === '1'}
      theme={first(query.theme) === 'dark' ? 'dark' : 'light'}
      token={first(query.token)}
    />
  );
}
