import type { Metadata } from 'next';
import { OrderBoard } from '@/components/order-board';

// A secret link for a TV: never indexed, never shown in previews.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Order board',
};

interface OrderBoardPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function OrderBoardPage({ params }: OrderBoardPageProps) {
  const { token } = await params;

  return <OrderBoard token={token} />;
}
